const PROMPTS = [
  // Self-Discovery
  "What are three qualities you like about yourself?",
  "How have your past challenges made you a stronger person?",
  "What is something you've always wanted to do but haven't yet? Why?",
  "Reflect on a compliment you received recently. How did it make you feel?",
  "What brings you the most joy and why?",
  // Daily Reflections
  "What made you smile today?",
  "What's something you learned today?",
  "Who made a positive impact on your life recently?",
  "Describe a moment today when you felt proud of yourself.",
  "How did you overcome a challenge today?",
  // Gratitude
  "List three small things that brought you happiness today.",
  "Who are you grateful for and why?",
  "What is one aspect of your life you're deeply thankful for?",
  "Reflect on a kindness someone showed you.",
  "What personal skills or talents are you most grateful for?",
  // Emotions and Feelings
  "What has been worrying you lately, and what can you do about it?",
  "Describe a recent situation that made you angry. How did you handle it?",
  "When did you last feel courageous?",
  "Write about a time you felt disappointed. How did you move forward?",
  "What does happiness look like to you?",
  // Goals and Aspirations
  "What is one goal you'd like to accomplish this month?",
  "How can you turn your passion into a purpose?",
  "Describe your ideal life in ten years. What can you do today to get closer to it?",
  "What is one habit you'd like to develop or break? Why?",
  "What skills would you like to learn or improve?",
  // Relationships
  "What qualities do you value in your friends and loved ones?",
  "How can you show appreciation to someone important in your life this week?",
  "Reflect on a relationship that has undergone change. What have you learned from this?",
  "What are you looking for in a significant other?",
  "How do your relationships shape the person you are?",
  // Creativity and Inspiration
  "What song lyrics or quotes inspire you the most and why?",
  "Describe a piece of art, book, or film that changed your perspective.",
  "What creative project would you undertake if you knew you could not fail?",
  "Write about a hobby you'd like to pick up and why.",
  "How does nature inspire you?",
  // Personal Challenges
  "What's a fear you'd like to overcome?",
  "In what areas of your life do you feel stuck, and what might help you move forward?",
  "Describe a time when you had to step outside your comfort zone.",
  "How do you deal with criticism and feedback?",
  "What does resilience mean to you?",
  // Mindfulness and Presence
  "What is something you can see, hear, taste, smell, and touch right now?",
  "How do you feel when you spend time alone? Do you enjoy your own company?",
  "What are some daily rituals that ground you?",
  "Describe a recent moment when you felt truly at peace.",
  "How does being present affect your day-to-day life?",
  // Looking Forward
  "What are you most looking forward to this week, month, or year?",
  "How do you envision your life evolving in the next five years?",
  "What changes can you make to live more in alignment with your values?",
  "What steps can you take to simplify your life?",
  "What adventures would you like to embark on?",
  // Reflections on the Past
  "What childhood memory brings you joy? Why?",
  "How have your priorities changed over the years?",
  "What would you tell your younger self with the knowledge you have now?",
  "Reflect on a past mistake. What did you learn from it?",
  "Describe a period in your life that you feel nostalgic about.",
  // Self-care and Wellness
  "What self-care practices do you find most beneficial?",
  "How do you recharge after a stressful day?",
  "What does wellness mean to you, and how do you practice it?",
  "Describe your perfect self-care day.",
  "What are some ways you can show yourself love and kindness this week?",
] as const

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0)
  return Math.floor((date.getTime() - start.getTime()) / 86_400_000)
}

export default function PromptOfTheDay() {
  const prompt = PROMPTS[getDayOfYear(new Date()) % PROMPTS.length]

  return (
    <div className="bg-white dark:bg-[#1E1E1E] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] overflow-hidden">
      {/* Header */}
      <div className="bg-violet-600 px-4 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Prompt of the Day</h2>
        <span className="text-xs font-medium text-violet-200 bg-violet-500/50 rounded-full px-2 py-0.5">
          Daily
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-4">
        <p className="text-sm italic leading-relaxed text-[#212121] dark:text-[#D0D0D0]">
          &ldquo;{prompt}&rdquo;
        </p>
      </div>
    </div>
  )
}
