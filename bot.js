import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Database sederhana untuk tracking user (bisa diganti dengan database real)
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
2. Keep responses concise and suitable for mobile messaging (2-3 paragraphs max)
3. After your response, provide brief analysis in the following JSON format:
{
  "feedback": "One helpful tip in Indonesian",
  "detectedLevel": "beginner"|"intermediate"|"advanced",
  "vocabularyUsed": ["word1", "word2"],
  "grammarScore": 0-100
}

IMPORTANT: All feedback must be in Indonesian (Bahasa Indonesia).

In ${session.mode === 'structured' ? 'structured mode, focus on teaching specific grammar points and vocabulary systematically' : 'casual mode, maintain natural conversation while providing gentle learning opportunities'}.

Format your response as:
RESPONSE: [Your ${languageName} response - keep it concise for mobile]
ANALYSIS: [JSON analysis with feedback in Indonesian]`;
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
      ...session.conversationHistory.slice(-10), // Ambil 10 pesan terakhir
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

    if (!response.ok) {
      throw new Error('Groq API error');
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error calling Groq API:', error);
    throw error;
  }
}

// Command: /start
bot.start((ctx) => {
  const session = initUserSession(ctx.from.id);
  ctx.reply(
    `👋 *Selamat datang di Language Learning Tutor!*\n\n` +
    `🌍 Belajar bahasa melalui percakapan interaktif\n` +
    `⚡ Powered by Groq AI (super cepat!)\n\n` +
    `Gunakan perintah berikut:\n` +
    `/bahasa - Pilih bahasa yang ingin dipelajari\n` +
    `/mode - Ubah mode pembelajaran\n` +
    `/level - Lihat level kemampuan Anda\n` +
    `/progres - Lihat progres pembelajaran\n` +
    `/target - Lihat target pembelajaran\n` +
    `/reset - Reset percakapan\n` +
    `/bantuan - Lihat panduan lengkap\n\n` +
    `Mulai dengan mengetik pesan dalam bahasa yang ingin Anda pelajari! 🚀`,
    { parse_mode: 'Markdown' }
  );
});

// Command: /bantuan
bot.command('bantuan', (ctx) => {
  ctx.reply(
    `📚 *Panduan Penggunaan*\n\n` +
    `1️⃣ *Pilih Bahasa*: Gunakan /bahasa untuk memilih bahasa target\n` +
    `2️⃣ *Mulai Percakapan*: Ketik pesan dalam bahasa yang dipilih\n` +
    `3️⃣ *Dapatkan Feedback*: AI akan merespons dan memberikan tips\n` +
    `4️⃣ *Track Progress*: Gunakan /progres untuk melihat perkembangan\n\n` +
    `💡 *Tips:*\n` +
    `- Mode Santai: Percakapan natural sehari-hari\n` +
    `- Mode Terstruktur: Fokus pada grammar dan vocabulary\n` +
    `- Reset percakapan dengan /reset jika ingin mulai topik baru`,
    { parse_mode: 'Markdown' }
  );
});

// Command: /bahasa
bot.command('bahasa', (ctx) => {
  const buttons = Object.keys(languages).map(code => {
    return [Markup.button.callback(
      `${languages[code].flag} ${languages[code].name}`,
      `lang_${code}`
    )];
  });

  ctx.reply(
    '🌍 *Pilih bahasa yang ingin Anda pelajari:*',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    }
  );
});

// Handle language selection
bot.action(/lang_(.+)/, (ctx) => {
  const langCode = ctx.match[1];
  const session = initUserSession(ctx.from.id);
  session.language = langCode;
  session.conversationHistory = []; // Reset conversation
  
  ctx.answerCbQuery();
  ctx.reply(
    `✅ Bahasa dipilih: ${languages[langCode].flag} *${languages[langCode].name}*\n\n` +
    `Mulai percakapan dalam ${languages[langCode].name}! Ketik pesan Anda.`,
    { parse_mode: 'Markdown' }
  );
});

// Command: /mode
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

// Handle mode selection
bot.action(/mode_(.+)/, (ctx) => {
  const mode = ctx.match[1];
  const session = initUserSession(ctx.from.id);
  session.mode = mode;
  
  const modeNames = {
    casual: '💬 Santai',
    structured: '📚 Terstruktur'
  };
  
  ctx.answerCbQuery();
  ctx.reply(
    `✅ Mode pembelajaran: *${modeNames[mode]}*\n\n` +
    `${mode === 'casual' ? 'Percakapan natural untuk latihan sehari-hari' : 'Pembelajaran terstruktur dengan fokus grammar dan vocabulary'}`,
    { parse_mode: 'Markdown' }
  );
});

// Command: /level
bot.command('level', (ctx) => {
  const session = initUserSession(ctx.from.id);
  const levelEmojis = {
    beginner: '🟢',
    intermediate: '🔵',
    advanced: '🟣'
  };
  const levelNames = {
    beginner: 'Pemula',
    intermediate: 'Menengah',
    advanced: 'Mahir'
  };
  
  ctx.reply(
    `📊 *Level Kemampuan Anda:*\n\n` +
    `${levelEmojis[session.proficiencyLevel]} *${levelNames[session.proficiencyLevel]}*\n\n` +
    `Level akan diupdate otomatis berdasarkan percakapan Anda.`,
    { parse_mode: 'Markdown' }
  );
});

// Command: /progres
bot.command('progres', (ctx) => {
  const session = initUserSession(ctx.from.id);
  ctx.reply(
    `📈 *Progres Pembelajaran:*\n\n` +
    `📝 Kata Baru: *${session.progress.vocabularyCount}*\n` +
    `✅ Skor Grammar: *${session.progress.grammarScore}%*\n` +
    `💬 Total Pesan: *${session.progress.messagesCount}*\n\n` +
    `Terus berlatih untuk meningkatkan skor Anda! 🚀`,
    { parse_mode: 'Markdown' }
  );
});

// Command: /target
bot.command('target', (ctx) => {
  const session = initUserSession(ctx.from.id);
  const goalsText = session.goals.map((goal, idx) => `${idx + 1}. ${goal}`).join('\n');
  
  ctx.reply(
    `🎯 *Target Pembelajaran:*\n\n${goalsText}\n\n` +
    `Percakapan akan disesuaikan dengan target Anda.`,
    { parse_mode: 'Markdown' }
  );
});

// Command: /reset
bot.command('reset', (ctx) => {
  const session = initUserSession(ctx.from.id);
  session.conversationHistory = [];
  session.progress.messagesCount = 0;
  
  ctx.reply(
    `🔄 *Percakapan di-reset!*\n\n` +
    `Mulai percakapan baru dalam ${languages[session.language].name}`,
    { parse_mode: 'Markdown' }
  );
});

// Handle regular messages (conversation)
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const userMessage = ctx.message.text;
  
  // Skip if message is a command
  if (userMessage.startsWith('/')) return;
  
  const session = initUserSession(userId);
  
  // Show typing indicator
  ctx.sendChatAction('typing');
  
  try {
    // Add user message to history
    session.conversationHistory.push({
      role: 'user',
      content: userMessage
    });
    
    // Call Groq API
    const fullResponse = await callGroqAPI(session, userMessage);
    const { response, analysis } = parseResponse(fullResponse);
    
    // Add assistant response to history
    session.conversationHistory.push({
      role: 'assistant',
      content: response
    });
    
    // Update progress
    session.progress.messagesCount++;
    if (analysis) {
      if (analysis.detectedLevel) {
        session.proficiencyLevel = analysis.detectedLevel;
      }
      if (analysis.vocabularyUsed) {
        session.progress.vocabularyCount += analysis.vocabularyUsed.length;
      }
      if (analysis.grammarScore !== undefined) {
        session.progress.grammarScore = analysis.grammarScore;
      }
    }
    
    // Limit conversation history to last 20 messages
    if (session.conversationHistory.length > 20) {
      session.conversationHistory = session.conversationHistory.slice(-20);
    }
    
    // Send response
    let replyText = `${response}`;
    
    // Add feedback if available
    if (analysis && analysis.feedback) {
      replyText += `\n\n💡 *Feedback:* ${analysis.feedback}`;
    }
    
    ctx.reply(replyText, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error processing message:', error);
    ctx.reply(
      '❌ Maaf, terjadi kesalahan. Silakan coba lagi.\n\n' +
      'Tips: Pastikan API key Groq Anda valid dan masih memiliki quota.'
    );
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi atau gunakan /reset');
});

// Start bot
bot.launch();

console.log('🤖 Telegram bot is running...');

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));