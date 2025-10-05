import { kv } from '@vercel/kv';

export class Database {
  // User session
  static async getSession(userId) {
    const session = await kv.get(`session:${userId}`);
    if (!session) {
      return this.createDefaultSession(userId);
    }
    return session;
  }

  static async saveSession(userId, session) {
    await kv.set(`session:${userId}`, session);
    await kv.expire(`session:${userId}`, 86400 * 30); // 30 days
  }

  static createDefaultSession(userId) {
    return {
      userId,
      language: 'english',
      mode: 'casual',
      proficiencyLevel: 'beginner',
      conversationHistory: [],
      progress: {
        vocabularyCount: 0,
        grammarScore: 0,
        messagesCount: 0,
        streak: 0,
        lastActiveDate: new Date().toISOString(),
        points: 0
      },
      goals: [
        'Menguasai salam dan perkenalan dasar',
        'Mempelajari konjugasi kata kerja present tense',
        'Membangun kosakata sehari-hari (100 kata)'
      ],
      vocabulary: [],
      settings: {
        dailyReminder: false,
        reminderTime: '09:00'
      }
    };
  }

  // Vocabulary
  static async addVocabulary(userId, words) {
    const session = await this.getSession(userId);
    const now = Date.now();
    
    const newWords = words.map(word => ({
      word,
      addedAt: now,
      reviewCount: 0,
      lastReview: null,
      mastered: false
    }));

    session.vocabulary = [...session.vocabulary, ...newWords];
    await this.saveSession(userId, session);
  }

  static async getVocabularyForReview(userId, limit = 10) {
    const session = await this.getSession(userId);
    return session.vocabulary
      .filter(v => !v.mastered)
      .sort((a, b) => (a.lastReview || 0) - (b.lastReview || 0))
      .slice(0, limit);
  }

  static async updateVocabularyReview(userId, word, correct) {
    const session = await this.getSession(userId);
    const vocab = session.vocabulary.find(v => v.word === word);
    
    if (vocab) {
      vocab.reviewCount++;
      vocab.lastReview = Date.now();
      if (correct && vocab.reviewCount >= 3) {
        vocab.mastered = true;
      }
    }
    
    await this.saveSession(userId, session);
  }

  // Streak tracking
  static async updateStreak(userId) {
    const session = await this.getSession(userId);
    const today = new Date().toISOString().split('T')[0];
    const lastActive = new Date(session.progress.lastActiveDate).toISOString().split('T')[0];
    
    if (today !== lastActive) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      
      if (lastActive === yesterday) {
        session.progress.streak++;
      } else {
        session.progress.streak = 1;
      }
      
      session.progress.lastActiveDate = new Date().toISOString();
      await this.saveSession(userId, session);
    }
    
    return session.progress.streak;
  }

  // Points & Leaderboard
  static async addPoints(userId, points) {
    const session = await this.getSession(userId);
    session.progress.points = (session.progress.points || 0) + points;
    await this.saveSession(userId, session);
    
    // Update leaderboard
    await kv.zadd('leaderboard:global', {
      score: session.progress.points,
      member: userId
    });
  }

  static async getLeaderboard(limit = 10) {
    const leaderboard = await kv.zrange('leaderboard:global', 0, limit - 1, {
      rev: true,
      withScores: true
    });
    
    return leaderboard;
  }

  // Analytics
  static async trackEvent(event, data) {
    const key = `analytics:${event}:${new Date().toISOString().split('T')[0]}`;
    await kv.incr(key);
    await kv.expire(key, 86400 * 90); // 90 days
  }

  static async getAnalytics(event, days = 7) {
    const results = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      const key = `analytics:${event}:${date}`;
      const count = await kv.get(key) || 0;
      results.push({ date, count });
    }
    return results;
  }

  // Conversation export
  static async getConversationHistory(userId, limit = 100) {
    const session = await this.getSession(userId);
    return session.conversationHistory.slice(-limit);
  }
}