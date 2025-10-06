import { Telegraf, Markup } from 'telegraf';
import { Database } from '../lib/database.js';
import { RateLimiter } from '../lib/rateLimiter.js';
import { VocabularyManager } from '../lib/vocabulary.js';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

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
  "grammarScore": 0-100,
  "pointsEarned": 1-10
}

IMPORTANT: All feedback must be in Indonesian (Bahasa Indonesia).

Format your response as:
RESPONSE: [Your ${languageName} response]
ANALYSIS: [JSON analysis]`;
}

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

async function callGroqAPI(session, userMessage) {
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
}

// Commands
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  await Database.trackEvent('bot_start');
  
  ctx.reply(
    `👋 *Selamat datang di Language Learning Tutor!*\n\n` +
    `🌍 Belajar bahasa melalui percakapan interaktif\n` +
    `⚡ Powered by Groq AI (super cepat!)\n\n` +
    `*Perintah Utama:*\n` +
    `/bahasa - Pilih bahasa\n` +
    `/mode - Ubah mode pembelajaran\n` +
    `/level - Lihat level kemampuan\n` +
    `/progres - Lihat progres & streak\n` +
    `/target - Lihat target pembelajaran\n\n` +
    `*Fitur Vocabulary:*\n` +
    `/vocab - Review kosakata\n` +
    `/quiz - Kuis vocabulary\n` +
    `/words - Daftar kata yang dipelajari\n\n` +
    `*Lainnya:*\n` +
    `/leaderboard - Ranking top learners\n` +
    `/export - Download riwayat chat\n` +
    `/reminder - Set pengingat harian\n` +
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
    `- Mode Terstruktur: Fokus grammar dan vocabulary\n` +
    `- Gunakan /quiz untuk latihan vocabulary\n` +
    `- Jaga streak harian untuk bonus poin!`,
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

bot.action(/lang_(.+)/, async (ctx) => {
  const langCode = ctx.match[1];
  const userId = ctx.from.id;
  const session = await Database.getSession(userId);
  
  session.language = langCode;
  session.conversationHistory = [];
  await Database.saveSession(userId, session);
  
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

bot.action(/mode_(.+)/, async (ctx) => {
  const mode = ctx.match[1];
  const userId = ctx.from.id;
  const session = await Database.getSession(userId);
  session.mode = mode;
  await Database.saveSession(userId, session);
  
  const modeNames = { casual: '💬 Santai', structured: '📚 Terstruktur' };
  
  ctx.answerCbQuery();
  ctx.reply(
    `✅ Mode pembelajaran: *${modeNames[mode]}*`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('level', async (ctx) => {
  const userId = ctx.from.id;
  const session = await Database.getSession(userId);
  const levelEmojis = { beginner: '🟢', intermediate: '🔵', advanced: '🟣' };
  const levelNames = { beginner: 'Pemula', intermediate: 'Menengah', advanced: 'Mahir' };
  
  ctx.reply(
    `📊 *Level Kemampuan:*\n\n${levelEmojis[session.proficiencyLevel]} *${levelNames[session.proficiencyLevel]}*\n\n` +
    `Level akan diupdate otomatis berdasarkan percakapan Anda.`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('progres', async (ctx) => {
  const userId = ctx.from.id;
  const session = await Database.getSession(userId);
  const streak = await Database.updateStreak(userId);
  
  const streakEmoji = streak >= 7 ? '🔥' : streak >= 3 ? '⭐' : '📊';
  
  ctx.reply(
    `📈 *Progres Pembelajaran:*\n\n` +
    `${streakEmoji} Streak: *${streak} hari*\n` +
    `🏆 Poin: *${session.progress.points || 0}*\n` +
    `📝 Kata Baru: *${session.progress.vocabularyCount}*\n` +
    `✅ Skor Grammar: *${session.progress.grammarScore}%*\n` +
    `💬 Total Pesan: *${session.progress.messagesCount}*\n` +
    `📚 Vocabulary: *${session.vocabulary.length} kata*\n\n` +
    `Terus berlatih untuk meningkatkan streak Anda! 🚀`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('target', async (ctx) => {
  const userId = ctx.from.id;
  const session = await Database.getSession(userId);
  const goalsText = session.goals.map((goal, idx) => `${idx + 1}. ${goal}`).join('\n');
  ctx.reply(`🎯 *Target Pembelajaran:*\n\n${goalsText}\n\nPercakapan akan disesuaikan dengan target Anda.`, { parse_mode: 'Markdown' });
});

bot.command('vocab', async (ctx) => {
  const userId = ctx.from.id;
  const words = await Database.getVocabularyForReview(userId, 10);
  
  if (words.length === 0) {
    ctx.reply('📚 Belum ada vocabulary untuk di-review. Mulai percakapan dulu!');
    return;
  }
  
  const wordList = words.map((v, i) => 
    `${i + 1}. *${v.word}* (reviewed ${v.reviewCount}x)`
  ).join('\n');
  
  ctx.reply(
    `📚 *Vocabulary untuk Review:*\n\n${wordList}\n\n` +
    `Gunakan /quiz untuk mulai kuis!`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('words', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const session = await Database.getSession(userId);
    
    if (!session.vocabulary || session.vocabulary.length === 0) {
      ctx.reply('📚 Belum ada vocabulary. Mulai percakapan untuk belajar kata baru!');
      return;
    }
    
    const mastered = session.vocabulary.filter(v => v.mastered);
    const learning = session.vocabulary.filter(v => !v.mastered);
    
    let message = `📚 *Vocabulary Anda*\n\n`;
    
    if (mastered.length > 0) {
      message += `✅ *Dikuasai (${mastered.length}):*\n`;
      message += mastered.slice(0, 10).map(v => `• ${v.word}`).join('\n');
      if (mastered.length > 10) message += `\n... dan ${mastered.length - 10} lagi`;
      message += '\n\n';
    }
    
    if (learning.length > 0) {
      message += `📖 *Sedang Dipelajari (${learning.length}):*\n`;
      message += learning.slice(0, 10).map(v => `• ${v.word}`).join('\n');
      if (learning.length > 10) message += `\n... dan ${learning.length - 10} lagi`;
    }
    
    message += `\n\n💡 Gunakan /quiz untuk latihan!`;
    
    ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Words error:', error);
    ctx.reply('❌ Gagal memuat vocabulary. Coba lagi nanti.');
  }
});

bot.command('quiz', async (ctx) => {
  const userId = ctx.from.id;
  const session = await Database.getSession(userId);
  
  if (!session.vocabulary || session.vocabulary.length === 0) {
    ctx.reply('📚 Belum ada vocabulary. Mulai percakapan untuk belajar kata baru!');
    return;
  }
  
  const quiz = VocabularyManager.generateQuiz(session.vocabulary, 5);
  
  session.activeQuiz = quiz;
  session.quizIndex = 0;
  await Database.saveSession(userId, session);
  
  ctx.reply(
    `🎯 *Kuis Vocabulary* (${quiz.length} pertanyaan)\n\n` +
    `Pertanyaan 1/${quiz.length}:\n${quiz[0].question}\n\n` +
    `Ketik jawaban Anda!`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('leaderboard', async (ctx) => {
  try {
    const leaderboard = await Database.getLeaderboard(10);
    
    if (!leaderboard || leaderboard.length === 0) {
      ctx.reply('🏆 Leaderboard masih kosong. Jadilah yang pertama!\n\nMulai chat untuk mendapatkan poin.');
      return;
    }
    
    const list = await Promise.all(
      leaderboard.map(async (entry, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        const userId = entry.member || entry.userId;
        const score = entry.score || 0;
        
        try {
          const user = await ctx.telegram.getChat(userId);
          const name = user.first_name || user.username || 'User';
          return `${medal} *${name}* - ${score} poin`;
        } catch (error) {
          const userIdStr = String(userId);
          const shortId = userIdStr.length > 4 ? userIdStr.slice(-4) : userIdStr;
          return `${medal} User${shortId} - ${score} poin`;
        }
      })
    );
    
    ctx.reply(
      `🏆 *Top 10 Learners:*\n\n${list.join('\n')}\n\n` +
      `Dapatkan poin dengan berlatih setiap hari! 💪`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Leaderboard error:', error);
    ctx.reply('❌ Gagal memuat leaderboard. Coba lagi nanti.');
  }
});

bot.command('export', async (ctx) => {
  const userId = ctx.from.id;
  const history = await Database.getConversationHistory(userId);
  
  if (history.length === 0) {
    ctx.reply('📄 Belum ada riwayat percakapan.');
    return;
  }
  
  const formatted = history.map(msg => 
    `[${msg.role.toUpperCase()}]: ${msg.content}`
  ).join('\n\n');
  
  const buffer = Buffer.from(formatted, 'utf-8');
  
  ctx.replyWithDocument(
    { source: buffer, filename: `conversation_${Date.now()}.txt` },
    { caption: '📄 Riwayat percakapan Anda' }
  );
});

bot.command('reset', async (ctx) => {
  const userId = ctx.from.id;
  const session = await Database.getSession(userId);
  session.conversationHistory = [];
  session.progress.messagesCount = 0;
  await Database.saveSession(userId, session);
  
  ctx.reply('🔄 *Percakapan di-reset!*\n\nMulai percakapan baru.', { parse_mode: 'Markdown' });
});

bot.command('reminder', (ctx) => {
  ctx.reply('⏰ Fitur reminder sedang dalam pengembangan. Coming soon!');
});

bot.command('skip', async (ctx) => {
  const userId = ctx.from.id;
  const session = await Database.getSession(userId);
  
  if (session.activeQuiz) {
    delete session.activeQuiz;
    delete session.quizIndex;
    await Database.saveSession(userId, session);
    ctx.reply('⏭️ Quiz di-skip. Gunakan /quiz untuk mulai lagi.');
  }
});

// Handle regular messages
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const userMessage = ctx.message.text;
  
  if (userMessage.startsWith('/')) return;
  
  const rateLimit = await RateLimiter.checkLimit(userId);
  if (!rateLimit.allowed) {
    ctx.reply(rateLimit.message);
    return;
  }
  
  const session = await Database.getSession(userId);
  
  // Check if answering quiz
  if (session.activeQuiz && session.quizIndex < session.activeQuiz.length) {
    const currentQ = session.activeQuiz[session.quizIndex];
    const correct = userMessage.toLowerCase().includes(currentQ.word.toLowerCase());
    
    await Database.updateVocabularyReview(userId, currentQ.word, correct);
    
    if (correct) {
      await Database.addPoints(userId, 5);
      session.quizIndex++;
      
      if (session.quizIndex < session.activeQuiz.length) {
        const nextQ = session.activeQuiz[session.quizIndex];
        await Database.saveSession(userId, session);
        ctx.reply(
          `✅ Benar! +5 poin\n\n` +
          `Pertanyaan ${session.quizIndex + 1}/${session.activeQuiz.length}:\n${nextQ.question}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        delete session.activeQuiz;
        delete session.quizIndex;
        await Database.saveSession(userId, session);
        ctx.reply('🎉 Kuis selesai! Bagus sekali! +25 poin bonus');
        await Database.addPoints(userId, 25);
      }
      return;
    } else {
      ctx.reply(`❌ Kurang tepat. Coba lagi atau ketik /skip`);
      return;
    }
  }
  
  ctx.sendChatAction('typing');
  
  try {
    await Database.updateStreak(userId);
    
    session.conversationHistory.push({ role: 'user', content: userMessage });
    
    const fullResponse = await callGroqAPI(session, userMessage);
    const { response, analysis } = parseResponse(fullResponse);
    
    session.conversationHistory.push({ role: 'assistant', content: response });
    session.progress.messagesCount++;
    
    if (analysis) {
      if (analysis.detectedLevel) session.proficiencyLevel = analysis.detectedLevel;
      if (analysis.vocabularyUsed?.length) {
        await Database.addVocabulary(userId, analysis.vocabularyUsed);
        session.progress.vocabularyCount += analysis.vocabularyUsed.length;
      }
      if (analysis.grammarScore !== undefined) session.progress.grammarScore = analysis.grammarScore;
      if (analysis.pointsEarned) await Database.addPoints(userId, analysis.pointsEarned);
    }
    
    if (session.conversationHistory.length > 20) {
      session.conversationHistory = session.conversationHistory.slice(-20);
    }
    
    await Database.saveSession(userId, session);
    await Database.trackEvent('message_sent');
    
    let replyText = response;
    if (analysis?.feedback) {
      replyText += `\n\n💡 *Feedback:* ${analysis.feedback}`;
    }
    if (analysis?.pointsEarned) {
      replyText += `\n+${analysis.pointsEarned} poin 🏆`;
    }
    
    ctx.reply(replyText, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error:', error);
    ctx.reply('❌ Maaf, terjadi kesalahan. Silakan coba lagi.');
  }
});

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