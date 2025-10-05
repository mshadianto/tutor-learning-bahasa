import { Telegraf, Markup } from 'telegraf';

// Database sederhana in-memory (di production pakai database real)
const userSessions = new Map();

// Bahasa yang tersedia
const languages = {
  english: { name: 'English (Inggris)', flag: '🇬🇧' },
  spanish: { name: 'Spanish (Español)', flag: '🇪🇸' },
  french: { name: 'French (Français)', flag: '🇫🇷' },
  german: { name: 'German (Deutsch)', flag: '🇩🇪' },
  japanese: { name: 'Japanese (日本語)', flag: '🇯🇵' },
  italian: { name: 'Italian (Italiano)', flag: '🇮🇹' },
  portuguese: { name: 'Portuguese (Português)', flag: '🇵🇹' },
  mandarin: { name: 'Mandarin Chinese (中文)', flag: '🇨🇳' },
  korean: { name: 'Korean (한국어)', flag: '🇰🇷' },
  arabic: { name: 'Arabic (العربية)', flag: '🇸🇦' }
};

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Inisialisasi user session
function initUserSession(userId) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, {
      language: 'english',
      mode: 'casual',
      proficiencyLevel: 'beginner',
      conversationHistory: [],
      progress: {
        vocabularyCount: 0,
        grammarScore: 0,
        messagesCount: 0
      },
      goals: [
        'Menguasai salam dan perkenalan dasar',
        'Mempelajari konjugasi kata kerja present tense',
        'Membangun kosakata sehari-hari (100 kata)'
      ]
    });
  }
  return userSessions.get(userId);
}

// Generate system prompt
function generateSystemPrompt(session) {
  const languageName = languages[session.language].name;
  const goalsText = session.goals.join(', ');
  
  return `You are a friendly and encouraging ${languageName} language tutor. The student's proficiency level is ${session.proficiencyLevel} and they are in ${session.mode} mode.

Their learning goals are: ${goalsText}

Instructions:
1. Respond naturally in ${languageName} at an appropriate level for a ${session.proficiencyLevel} learner
2. Keep responses concise for mobile messaging (2-3 paragraphs max)
3. After your response, provide brief analysis in JSON format:
{
  "feedback": "One helpful tip in Indonesian",
  "detectedLevel": "beginner"|"intermediate"|"advanced",
  "vocabularyUsed": ["word1", "word2"],
  "grammarScore": 0-100
}

IMPORTANT: All feedback must be in Indonesian (Bahasa Indonesia).

Format your response as:
RESPONSE: [Your ${languageName} response]
ANALYSIS: [JSON analysis]`;
}

// Parse response dari Groq
function parseResponse(text) {
  const responsePart = text.match(/RESPONSE:(.*?)(?=ANALYSIS:|$)/s);
  const analysisPart = text.match(/ANALYSIS:(.*)/s);
  
  let response = responsePart ? responsePart[1].trim() : text;
  let analysis = null;

  if (analysisPart) {
    try {
      const jsonMatch = analysisPart[1].match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse analysis:', e);
    }
  }

  return { response, analysis };
}

// Call Groq API
async function callGroqAPI(session, userMessage) {
  try {
    const messages = [
      { role: 'system', content: generateSystemPrompt(session) },
      ...session.conversationHistory.slice(-10),
      { role: 'user', content: userMessage }
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) throw new Error('Groq API error');

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error calling Groq API:', error);
    throw error;
  }
}

// Setup bot commands
bot.start((ctx) => {
  initUserSession(ctx.from.id);
  ctx.reply(
    `👋 *Selamat datang di Language Learning Tutor!*\n\n` +
    `🌍 Belajar bahasa melalui percakapan interaktif\n` +
    `⚡ Powered by Groq AI (super cepat!)\n\n` +
    `Gunakan perintah berikut:\n` +
    `/bahasa - Pilih bahasa\n` +
    `/mode - Ubah mode pembelajaran\n` +
    `/level - Lihat level kemampuan\n` +
    `/progres - Lihat progres\n` +
    `/target - Lihat target pembelajaran\n` +
    `/reset - Reset percakapan\n` +
    `/bantuan - Panduan lengkap\n\n` +
    `Mulai dengan mengetik pesan dalam bahasa yang ingin Anda pelajari! 🚀`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('bantuan', (ctx) => {
  ctx.reply(
    `📚 *Panduan Penggunaan*\n\n` +
    `1️⃣ *Pilih Bahasa*: /bahasa untuk memilih bahasa target\n` +
    `2️⃣ *Mulai Percakapan*: Ketik pesan dalam bahasa yang dipilih\n` +
    `3️⃣ *Dapatkan Feedback*: AI akan merespons dan memberikan tips\n` +
    `4️⃣ *Track Progress*: /progres untuk melihat perkembangan\n\n` +
    `💡 *Tips:*\n` +
    `- Mode Santai: Percakapan natural\n` +
    `- Mode Terstruktur: Fokus grammar dan vocabulary`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('bahasa', (ctx) => {
  const buttons = Object.keys(languages).map(code => {
    return [Markup.button.callback(
      `${languages[code].flag} ${languages[code].name}`,
      `lang_${code}`
    )];
  });

  ctx.reply(
    '🌍 *Pilih bahasa yang ingin Anda pelajari:*',
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
});

bot.action(/lang_(.+)/, (ctx) => {
  const langCode = ctx.match[1];
  const session = initUserSession(ctx.from.id);
  session.language = langCode;
  session.conversationHistory = [];
  
  ctx.answerCbQuery();
  ctx.reply(
    `✅ Bahasa dipilih: ${languages[langCode].flag} *${languages[langCode].name}*\n\n` +
    `Mulai percakapan dalam ${languages[langCode].name}!`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('mode', (ctx) => {
  ctx.reply(
    '📖 *Pilih mode pembelajaran:*',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('💬 Santai', 'mode_casual'),
          Markup.button.callback('📚 Terstruktur', 'mode_structured')
        ]
      ])
    }
  );
});

bot.action(/mode_(.+)/, (ctx) => {
  const mode = ctx.match[1];
  const session = initUserSession(ctx.from.id);
  session.mode = mode;
  
  const modeNames = { casual: '💬 Santai', structured: '📚 Terstruktur' };
  
  ctx.answerCbQuery();
  ctx.reply(
    `✅ Mode pembelajaran: *${modeNames[mode]}*`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('level', (ctx) => {
  const session = initUserSession(ctx.from.id);
  const levelEmojis = { beginner: '🟢', intermediate: '🔵', advanced: '🟣' };
  const levelNames = { beginner: 'Pemula', intermediate: 'Menengah', advanced: 'Mahir' };
  
  ctx.reply(
    `📊 *Level Kemampuan:*\n\n${levelEmojis[session.proficiencyLevel]} *${levelNames[session.proficiencyLevel]}*`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('progres', (ctx) => {
  const session = initUserSession(ctx.from.id);
  ctx.reply(
    `📈 *Progres Pembelajaran:*\n\n` +
    `📝 Kata Baru: *${session.progress.vocabularyCount}*\n` +
    `✅ Skor Grammar: *${session.progress.grammarScore}%*\n` +
    `💬 Total Pesan: *${session.progress.messagesCount}*`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('target', (ctx) => {
  const session = initUserSession(ctx.from.id);
  const goalsText = session.goals.map((goal, idx) => `${idx + 1}. ${goal}`).join('\n');
  ctx.reply(`🎯 *Target Pembelajaran:*\n\n${goalsText}`, { parse_mode: 'Markdown' });
});

bot.command('reset', (ctx) => {
  const session = initUserSession(ctx.from.id);
  session.conversationHistory = [];
  session.progress.messagesCount = 0;
  ctx.reply('🔄 *Percakapan di-reset!*', { parse_mode: 'Markdown' });
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const userMessage = ctx.message.text;
  
  if (userMessage.startsWith('/')) return;
  
  const session = initUserSession(userId);
  ctx.sendChatAction('typing');
  
  try {
    session.conversationHistory.push({ role: 'user', content: userMessage });
    
    const fullResponse = await callGroqAPI(session, userMessage);
    const { response, analysis } = parseResponse(fullResponse);
    
    session.conversationHistory.push({ role: 'assistant', content: response });
    session.progress.messagesCount++;
    
    if (analysis) {
      if (analysis.detectedLevel) session.proficiencyLevel = analysis.detectedLevel;
      if (analysis.vocabularyUsed) session.progress.vocabularyCount += analysis.vocabularyUsed.length;
      if (analysis.grammarScore !== undefined) session.progress.grammarScore = analysis.grammarScore;
    }
    
    if (session.conversationHistory.length > 20) {
      session.conversationHistory = session.conversationHistory.slice(-20);
    }
    
    let replyText = response;
    if (analysis?.feedback) {
      replyText += `\n\n💡 *Feedback:* ${analysis.feedback}`;
    }
    
    ctx.reply(replyText, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error:', error);
    ctx.reply('❌ Maaf, terjadi kesalahan. Silakan coba lagi.');
  }
});

// Vercel serverless function handler
export default async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
      res.status(200).json({ ok: true });
    } else {
      res.status(200).json({ status: 'Bot is running on Vercel!' });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};