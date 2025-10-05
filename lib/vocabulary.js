export class VocabularyManager {
  static generateQuiz(words, count = 5) {
    const shuffled = words.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(count, words.length));
    
    return selected.map(vocab => {
      const quizType = Math.random() > 0.5 ? 'translation' : 'usage';
      
      return {
        word: vocab.word,
        type: quizType,
        question: quizType === 'translation' 
          ? `Apa arti kata "${vocab.word}"?`
          : `Buat kalimat menggunakan kata "${vocab.word}"`
      };
    });
  }

  static async checkAnswer(word, answer, correctAnswer) {
    // Simple check - could be enhanced with AI
    const normalized = answer.toLowerCase().trim();
    const correct = correctAnswer.toLowerCase().trim();
    
    return normalized.includes(correct) || correct.includes(normalized);
  }
}