/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Settings, 
  BrainCircuit, 
  Plus, 
  Trash2, 
  ChevronRight, 
  CheckCircle2, 
  XCircle,
  Clock,
  LayoutDashboard,
  GraduationCap,
  Volume2,
  SquareStack,
  Languages,
  RotateCcw,
  LogOut,
  User as UserIcon,
  LogIn,
  Trophy,
  History,
  Target,
  Mic,
  MessageSquare,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { HSK1_TITLES } from './data/hsk1';
import { HSK2_TITLES } from './data/hsk2';
import { HSK3_TITLES } from './data/hsk3';
import { VocabularyItem, Question, Language, UserProfile, StudyLog, FluencySituation, FluencyEvaluation } from './types';
import { fetchVocabulary, generateTest, generateListeningTest, processNewWord, searchVocabulary, generateFluencySituation, evaluateFluencyResponse } from './lib/gemini';
import { auth, db, googleProvider } from './lib/firebase';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  getDocFromServer,
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc,
  updateDoc,
  increment,
  serverTimestamp,
  orderBy,
  limit
} from 'firebase/firestore';
import { handleFirestoreError } from './lib/firebase';

export default function App() {
  const [view, setView] = useState<'vocabulary' | 'test' | 'growth_vault' | 'dashboard' | 'listening' | 'flashcards' | 'practice_hub' | 'fluency'>('dashboard');
  const [selectedPracticeType, setSelectedPracticeType] = useState<'multiple-choice' | 'translation' | 'ordering' | 'listening' | 'flashcards' | 'fluency'>('translation');
  const [language, setLanguage] = useState<Language>('Chinese');
  const [level, setLevel] = useState<string>('HSK 1');
  
  // Fluency state
  const [currentFluencySituation, setCurrentFluencySituation] = useState<FluencySituation | null>(null);
  const [userFluencyResponse, setUserFluencyResponse] = useState('');
  const [fluencyEvaluation, setFluencyEvaluation] = useState<FluencyEvaluation | null>(null);
  const [isFluencyLoading, setIsFluencyLoading] = useState(false);
  const [words, setWords] = useState<VocabularyItem[]>([]);
  const [customWords, setCustomWords] = useState<Record<string, VocabularyItem[]>>({});
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [todayLog, setTodayLog] = useState<StudyLog | null>(null);
  const [studyStartTime, setStudyStartTime] = useState<number | null>(null);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [lockedItemInfo, setLockedItemInfo] = useState<string>('');
  const [penaltyMessage, setPenaltyMessage] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<{ price: string; duration: string; id: string; isBest?: boolean }>({ price: '69k', duration: '6 THÁNG', id: 'price69', isBest: true });
  const [paymentStatus, setPaymentStatus] = useState<{ text: string; color: string } | null>(null);

  const qrImages: Record<string, string> = {
    price29: "https://img.upanh.moe/jk4JxwNq/1776943179723.png",
    price49: "https://img.upanh.moe/xS66D13N/1776943200390.png",
    price69: "https://img.upanh.moe/LX0YFk9v/1776943214312.png"
  };
  const [loading, setLoading] = useState(true);
  const [testMode, setTestMode] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<{ score: number; total: number } | null>(null);
  const [mistakes, setMistakes] = useState<VocabularyItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newWord, setNewWord] = useState<{
    word: string;
    pronunciation: string;
    meaning: string;
    partOfSpeech: string;
    grammar: string;
    label: 'Daily' | 'Marketing' | 'Work';
    caption: string;
    examples: { target: string; vietnamese: string; }[];
  }>({ 
    word: '', 
    pronunciation: '', 
    meaning: '', 
    partOfSpeech: 'noun', 
    grammar: '', 
    label: 'Daily',
    caption: '',
    examples: [{ target: '', vietnamese: '' }, { target: '', vietnamese: '' }] 
  });
  const [isCorrectionVisible, setIsCorrectionVisible] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isSlideshowActive, setIsSlideshowActive] = useState(false);
  const [quickAddInput, setQuickAddInput] = useState('');
  const [isQuickAdding, setIsQuickAdding] = useState(false);
  const [quickAddPreview, setQuickAddPreview] = useState<VocabularyItem | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [viewHistory, setViewHistory] = useState<{ view: any; level: string; language: Language; testMode: boolean }[]>([]);

  const handleNavigate = (newView: typeof view, newLevel?: string, newLang?: Language, newTestMode?: boolean) => {
    setViewHistory(prev => [...prev, { view, level, language, testMode }]);
    setView(newView);
    if (newLevel) setLevel(newLevel);
    if (newLang) setLanguage(newLang);
    if (newTestMode !== undefined) setTestMode(newTestMode);
    setSearchResults(null);
    setSearchError(null);
  };

  const goBack = () => {
    if (viewHistory.length > 0) {
      const prev = viewHistory[viewHistory.length - 1];
      setView(prev.view);
      setLevel(prev.level);
      setLanguage(prev.language);
      setTestMode(prev.testMode);
      setViewHistory(prevStack => prevStack.slice(0, -1));
      setSearchResults(null);
      setSearchError(null);
    } else {
      setView('dashboard');
      setTestMode(false);
    }
  };

  // Search logic
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Auth and Profile sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        await syncUserProfile(firebaseUser);
        await loadCustomWords(firebaseUser.uid);
        await fetchTodayLog(firebaseUser.uid);
      } else {
        setUser(null);
        setUserProfile(null);
        setCustomWords({});
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const syncUserProfile = async (u: FirebaseUser) => {
    try {
      const userRef = doc(db, 'users', u.uid);
      // Try server first to ensure connection, fallback to local cache if needed
      let userSnap;
      try {
        userSnap = await getDocFromServer(userRef);
      } catch (err) {
        userSnap = await getDoc(userRef);
      }
      
      const today = new Date().toISOString().split('T')[0];

      if (userSnap.exists()) {
        const data = userSnap.data() as UserProfile;
        const updates: Partial<UserProfile> = {};
        
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        
        if (data.lastActiveDate !== today) {
          // First login of the day: +5 🔥
          updates.fireStreak = (data.fireStreak || 0) + 5;
          updates.lastActiveDate = today;

          // Penalty check: missed at least one full day
          if (data.lastActiveDate !== yesterday && data.lastActiveDate !== today) {
            updates.fireStreak = Math.max(0, updates.fireStreak - 2);
            setPenaltyMessage(`Tiếc quá Diễm ơi, vì hôm qua bạn vắng mặt nên chuỗi lửa đã bị rơi mất 2 🔥 rồi. Hôm nay hãy học bù để lấy lại phong độ nhé!`);
          }

          // Streak logic
          updates.currentStreak = data.lastActiveDate === yesterday 
            ? (data.currentStreak || 0) + 1 
            : 1;
        }

        await updateDoc(userRef, updates);
        setUserProfile({ ...data, ...updates });
      } else {
        const newProfile: UserProfile = {
          uid: u.uid,
          email: u.email || '',
          displayName: u.displayName || 'Learner',
          totalStudyTime: 0,
          dailyGoal: 5,
          currentStreak: 1,
          fireStreak: 5, // First login +5
          lastActiveDate: today,
          isPremium: false,
          temporaryUnlocks: []
        };
        await setDoc(userRef, newProfile);
        setUserProfile(newProfile);
      }
    } catch (error) {
      handleFirestoreError(error, 'get', `users/${u.uid}`);
    }
  };

  const loadCustomWords = async (uid: string) => {
    try {
      const wordsRef = collection(db, 'users', uid, 'customWords');
      const q = query(wordsRef);
      const querySnapshot = await getDocs(q);
      const wordsMap: Record<string, VocabularyItem[]> = {};
      querySnapshot.forEach((doc) => {
        const word = { id: doc.id, ...doc.data() } as VocabularyItem;
        const wordKey = `${word.language || 'Chinese'}-${word.level || word.topic || 'HSK 1'}`;
        if (!wordsMap[wordKey]) wordsMap[wordKey] = [];
        wordsMap[wordKey].push(word);
      });
      setCustomWords(wordsMap);
    } catch (error) {
       // We log but don't necessarily throw here to avoid blocking the whole UI
       console.error("Error loading custom words:", error);
    }
  };

  const fetchTodayLog = async (uid: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const logRef = doc(db, 'users', uid, 'studyLogs', today);
      
      let logSnap;
      try {
        logSnap = await getDocFromServer(logRef);
      } catch (err) {
        logSnap = await getDoc(logRef);
      }

      if (logSnap.exists()) {
        setTodayLog(logSnap.data() as StudyLog);
      } else {
        const newLog: StudyLog = { date: today, wordsLearned: [], wordsReviewed: [] };
        await setDoc(logRef, newLog);
        setTodayLog(newLog);
      }
    } catch (error) {
      console.error("Error fetching today log:", error);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setView('dashboard');
  };

  // Study Time Tracker and Persistence
  useEffect(() => {
    if (view !== 'dashboard' && user) {
      if (!studyStartTime) setStudyStartTime(Date.now());
    } else if (view === 'dashboard' && studyStartTime && user) {
      const durationSeconds = Math.floor((Date.now() - studyStartTime) / 1000);
      const minutes = Math.floor(durationSeconds / 60);
      if (minutes >= 1) {
        updateDoc(doc(db, 'users', user.uid), {
          totalStudyTime: increment(minutes)
        });
      }
      setStudyStartTime(null);
    }
  }, [view, user, studyStartTime]);

  // TTS Helper
  const playAudio = (text: string, lang: Language) => {
    const utterance = new SpeechSynthesisUtterance(text);
    if (lang === 'Chinese') utterance.lang = 'zh-CN';
    else utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  // Personalized message
  const getCurrentMessage = () => {
    const now = new Date();
    const hour = now.getHours();
    const minutes = now.getMinutes();
    
    if (hour === 10 || (hour === 11 && minutes <= 15)) {
      return `Gần 11h rồi đấy, ${userProfile?.displayName || 'Tyanna'}! Làm việc tại shop/văn phòng năng suất nhé! (Ca làm: 13:30 - 22:00)`;
    }
    
    if (hour >= 9 && hour <= 11) {
      return "Chào buổi sáng! Đây là khung giờ vàng (9h-11h) để học tập đấy. TYANNA chúc bạn học thật tốt nhé!";
    }
    return `Chào mừng bạn! TYANNA sẵn sàng hỗ trợ bạn chinh phục ngôn ngữ mới.`;
  };

  useEffect(() => {
    if (view === 'vocabulary') {
      loadWords();
    }
  }, [level, language, view]);

  // LocalStorage persistence
  useEffect(() => {
    localStorage.setItem('smartlingua_custom_words', JSON.stringify(customWords));
  }, [customWords]);

  // Slideshow logic
  useEffect(() => {
    let interval: any;
    if (isSlideshowActive && view === 'flashcards' && !isFlipped) {
      interval = setInterval(() => {
        if (flashcardIndex < words.length - 1) {
          setFlashcardIndex(prev => prev + 1);
        } else {
          setIsSlideshowActive(false);
          setView('dashboard');
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [isSlideshowActive, view, isFlipped, flashcardIndex, words.length]);

  const loadWords = async () => {
    const lockInfo = getLockedItemInfo(undefined, language, level);
    if (lockInfo) {
      setLockedItemInfo(lockInfo);
      setIsPremiumModalOpen(true);
      setView('dashboard');
      return;
    }
    setLoading(true);
    try {
      const data = await fetchVocabulary(level, language);
      const levelKey = `${language}-${level}`;
      const savedForLevel = customWords[levelKey] || [];
      const combined = [...data, ...savedForLevel].map(w => ({
        ...w,
        status: w.status || 'Chưa thuộc'
      }));
      setWords(combined as VocabularyItem[]);
    } catch (error) {
      console.error("Error loading words:", error);
    } finally {
      setLoading(false);
    }
  };

  const getLockedItemInfo = (practiceType?: string, currentLanguage?: Language, currentLevel?: string): string | null => {
    if (userProfile?.isPremium) return null;

    const lang = currentLanguage || language;
    const lvl = currentLevel || level;

    // Check temporary unlocks (fireStreak rewards)
    if (userProfile?.temporaryUnlocks?.includes(`${lang}-${lvl}`)) return null;
    if (practiceType && userProfile?.temporaryUnlocks?.includes(`practice-${practiceType}`)) return null;

    const freeHSK = ['HSK 1', 'HSK 2'];
    const freeTOEIC = ['Part 1 (Photos)', 'Part 2 (Question-Response)', 'Part 3 (Short Conversations)', 'Part 4 (Short Talks)', 'Part 1-4 (Listening)'];
    const freeIELTS = ['Band 5.0 (Foundation)'];
    const freePracticeTypes = ['flashcards', 'listening'];

    // Check if Business English topic
    const isBusinessTopic = lang === 'English' && ['Marketing', 'E-commerce', 'Financial Terms'].includes(lvl);

    // PRACTICE LOCKS
    if (practiceType === 'fluency' || practiceType === 'translation' || practiceType === 'ordering') {
      return `chế độ ${practiceType === 'fluency' ? 'Luyện nói (Fluency)' : 'Viết câu'}`;
    }

    if (practiceType && !freePracticeTypes.includes(practiceType)) {
      return `bài tập ${practiceType}`;
    }

    // CONTENT LOCKS
    if (lang === 'Chinese' && !freeHSK.some(h => lvl.startsWith(h))) {
      return lvl;
    }
    if (lang === 'TOEIC' && (lvl.includes('Part 5') || lvl.includes('Part 6') || lvl.includes('Part 7') || lvl.includes('Business'))) {
      return lvl;
    }
    if (lang === 'IELTS' && (lvl.includes('Band 6') || lvl.includes('Band 7') || lvl.includes('Writing'))) {
      return lvl;
    }
    if (lang === 'English' || isBusinessTopic) {
      return lvl; // All Marketing/Business topics are premium
    }

    return null;
  };

  const getWordIcon = (word: string) => {
    const icons: Record<string, string> = {
      '你': '👋', '好': '👍', '您': '🙇', '你们': '👥', '对不起': '🙇‍♂️', '没关系': '👌',
      '谢谢': '🙏', '不': '❌', '不客气': '😊', '再见': '👋', '再見': '👋',
      '叫': '📢', '什么': '❓', '名字': '📛', '我': '🙋‍♂️', '是': '✅',
      '老师': '👨‍🏫', '吗': '❓', '学生': '🧑‍🎓', '人': '👤',
      '她': '👩', '谁': '❓', '的': '🔗', '汉语': '🇨🇳', '哪': '❓', '国': '🏳️', '呢': '🗨️', '他': '👨', '同学': '🎒', '朋友': '🤝',
      '家': '🏠', '有': '➕', '口': '👄', '女儿': '👧', '几': '🔢', '岁': '🎂', '了': '🏁', '今年': '📅', '多': '➕', '大': '📏',
      '会': '🧠', '说': '🗣️', '妈妈': '👩‍👦', '菜': '🥗', '很': '📈', '好吃': '😋', '做': '🍳', '写': '✍️', '汉字': '🏮', '字': '🔤', '怎么': '❓', '读': '📖',
      '请': '🙇', '问': '❓', '今天': '📅', '号': '🔢', '月': '🌙', '星期': '📅', '昨天': '⏪', '明天': '⏩', '去': '🚶', '学校': '🏫', '看': '👁️', '书': '📚',
      '想': '💭', '喝': '🥤', '茶': '🍵', '吃': '🥢', '米饭': '🍚', '下午': '🌆', '商店': '🏪', '买': '🛍️', '个': '⚖️', '杯子': '🥛', '这': '📍', '多少': '💰', '钱': '💵', '块': '🪙', '那': '👉',
      '小': '🤏', '猫': '🐱', '在': '📍', '那儿': '📍', '狗': '🐶', '椅子': '🪑', '下面': '👇', '哪儿': '❓', '工作': '💼', '儿子': '👦', '医院': '🏥', '医生': '👨‍⚕️', '爸爸': '👨‍👧',
      '桌子': '🪑', '上': '👆', '电脑': '💻', '和': '➕', '本': '📗', '里': '📥', '前面': '🏹', '后面': '🔙', '这儿': '📍', '没有': '🚫', '能': '💪', '坐': '🪑',
      '现在': '⏰', '点': '🕘', '分': '⏱️', '中午': '☀️', '吃饭': '🍱', '时候': '⏳', '回': '🔙', '我们': '👥', '电影': '🎬', '住': '🏠', '前': '⬅️',
      '天气': '🌤️', '怎么样': '❓', '太': '‼️', '热': '🔥', '冷': '❄️', '下雨': '🌧️', '小姐': '👩', '来': '➡️', '身体': '🧘', '爱': '❤️', '些': '🤏', '水果': '🍎', '水': '💧',
      '喂': '📞', '也': '➕', '学习': '📚', '上午': '🌅', '睡觉': '😴', '电视': '📺', '喜欢': '❤️', '给': '🎁', '打电话': '☎️', '吧': '🗨️',
      '东西': '📦', '一点儿': '🤏', '苹果': '🍎', '看见': '👁️', '先生': '👨‍💼', '开': '🚗', '车': '🚗', '回来': '🔙', '分钟': '⏱️', '后': '🔜', '衣服': '👕', '漂亮': '✨', '啊': '😮', '少': '➖', '不少': '➕', '这些': '📍', '都': '🌐',
      '认识': '🤝', '年': '🗓️', '大学': '🎓', '饭店': '🏨', '出租车': '🚕', '一起': '👫', '高兴': '😊', '听': '👂', '飞机': '✈️'
    };
    return icons[word] || '✨';
  };

  const isPremiumLocked = (practiceType?: string, currentLanguage?: Language, currentLevel?: string) => {
    return !!getLockedItemInfo(practiceType, currentLanguage, currentLevel);
  };

  const handleRedeemStreak = async () => {
    if (!user || !userProfile) return;
    if (userProfile.fireStreak < 100) {
      alert("Bạn cần tích đủ 100 Chuỗi lửa để đổi thưởng!");
      return;
    }

    // Reward: 100 🔥 = 1 dedicated exam review session (Temporary unlock or start test)
    // The prompt says "đổi được 01 bài ôn luyện thi", we'll interpret as starting a test session
    const updates = {
      fireStreak: userProfile.fireStreak - 100
    };

    await updateDoc(doc(db, 'users', user.uid), updates);
    setUserProfile({ ...userProfile, ...updates });
    alert("Chúc mừng! Bạn đã dùng 100 🔥 để đổi lấy 01 bài ôn luyện thi tập trung. Hệ thống đang chuẩn bị đề thi cho bạn...");
    handleStartTest('translation');
  };

  const handleConfirmPayment = async () => {
    if (!user) return;
    
    const months: Record<string, number> = { price29: 2, price49: 4, price69: 6 };
    const monthsCount = months[selectedPlan.id] || 0;
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + monthsCount);
    const expiryStr = expiry.toLocaleDateString('vi-VN');

    try {
      await addDoc(collection(db, 'payment_requests'), {
        email: user.email,
        userId: user.uid,
        status: 'pending',
        timestamp: serverTimestamp(),
        plan: selectedPlan,
        expectedExpiry: expiryStr
      });
      setPaymentStatus({ 
        text: `⏳ Đã chuyển tiền gói ${selectedPlan.price}, chờ Tyanna duyêt. Hạn dùng dự kiến: ${expiryStr}`, 
        color: '#d4a373' 
      });
      alert(`Tyanna đã nhận được yêu cầu nâng cấp gói ${selectedPlan.price} (${selectedPlan.duration})! \n\nHệ thống sẽ mở khóa bài học đến ngày ${expiryStr} sau khi xác nhận chuyển khoản thành công. 💖`);
    } catch (error) {
      console.error("Payment request failed:", error);
      alert("Có lỗi xảy ra, vui lòng thử lại hoặc liên hệ Tyanna nhé!");
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    setSearchResults(null);

    try {
      const isGlobal = view === 'dashboard';
      const context = isGlobal ? undefined : { language, level };
      const results = await searchVocabulary(searchQuery, context);

      // Context-aware search localization (Item 16)
      if (results.error === 'not_in_dataset' || results.notInDataset) {
        // Refined error messages as per Request 4.2
        const suggestion = language === 'TOEIC' ? 'kho IELTS' : 'kho TOEIC';
        const targetGoal = language === 'TOEIC' ? 'IELTS' : 'TOEIC';
        setSearchError(`Từ này thuộc ${suggestion}, hãy chuyển sang mục ${targetGoal} hoặc về Trang chủ để tìm nhé!`);
      } else {
        setSearchResults(results);
      }
    } catch (error) {
      console.error("Search failed:", error);
      setSearchError("Không thể tìm kiếm lúc này. Thử lại sau!");
    } finally {
      setIsSearching(false);
    }
  };

  const handleStartFluency = async () => {
    const lockInfo = getLockedItemInfo('fluency');
    if (lockInfo) {
      setLockedItemInfo(lockInfo);
      setIsPremiumModalOpen(true);
      return;
    }
    
    setIsFluencyLoading(true);
    setFluencyEvaluation(null);
    setUserFluencyResponse('');
    try {
      const situation = await generateFluencySituation(language, level);
      setCurrentFluencySituation(situation);
      setView('fluency');
    } catch (error) {
      console.error("Fluency start failed:", error);
    } finally {
      setIsFluencyLoading(false);
    }
  };

  const handleSubmitFluency = async () => {
    if (!userFluencyResponse.trim() || !currentFluencySituation) return;
    
    setIsFluencyLoading(true);
    try {
      const evaluation = await evaluateFluencyResponse(language, currentFluencySituation, userFluencyResponse);
      setFluencyEvaluation(evaluation);
      
      // Award 5 fire streak points for completing fluency practice
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          fireStreak: increment(5)
        });
        setUserProfile(prev => prev ? { ...prev, fireStreak: (prev.fireStreak || 0) + 5 } : null);
      }
    } catch (error) {
      console.error("Fluency evaluation failed:", error);
    } finally {
      setIsFluencyLoading(false);
    }
  };

  const handleQuickReview = async () => {
    if (!user) {
      handleLogin();
      return;
    }
    setLoading(true);
    try {
      // Collect ALL custom words from all levels in Growth Vault
      const allVaultWords = Object.values(customWords).flat();
      
      const needPractice = allVaultWords.filter(w => w.status === 'Cần luyện tập');
      const unlearned = allVaultWords.filter(w => w.status === 'Chưa thuộc' || !w.status);
      const mastered = allVaultWords.filter(w => w.status === 'Đã thuộc');
      
      let selected: VocabularyItem[] = [];
      
      if (needPractice.length > 0) {
        selected = [...needPractice].sort(() => 0.5 - Math.random()).slice(0, 10);
        if (selected.length < 10) {
          const extra = [...unlearned, ...mastered].sort(() => 0.5 - Math.random()).slice(0, 10 - selected.length);
          selected = [...selected, ...extra];
        }
      } else if (allVaultWords.length > 0) {
        selected = allVaultWords.sort(() => 0.5 - Math.random()).slice(0, 10);
      } else {
        // Fallback to HSK 1 basics
        const fetched = await fetchVocabulary('HSK 1', 'Chinese');
        selected = fetched.slice(0, 10);
      }
      
      setWords(selected);
      setQuestions([]);
      handleNavigate('test', undefined, undefined, true);
      
      const testLang = selected[0]?.language || language;
      const testData = await generateTest(selected, testLang, 'translation');
      setQuestions(testData);
      setCurrentQuestionIndex(0);
      setUserAnswers([]);
      setTestResult(null);
    } catch (error) {
      console.error("Quick review failed:", error);
      alert("Hệ thống ôn tập đang bận, vui lòng thử lại sau!");
    } finally {
      setLoading(false);
    }
  };

  const handleStartTest = async (type?: 'multiple-choice' | 'translation' | 'ordering' | 'listening' | 'flashcards' | 'fluency', targetLang?: Language, targetLevel?: string) => {
    if (type === 'fluency') {
      handleStartFluency();
      return;
    }
    const lockInfo = getLockedItemInfo(type, targetLang, targetLevel);
    if (lockInfo) {
      setLockedItemInfo(lockInfo);
      setIsPremiumModalOpen(true);
      return;
    }
    setLoading(true);
    try {
      setQuestions([]);
      let sourceWords = words;
      
      const activeLang = targetLang || language;
      const activeLevel = targetLevel || level;

      // If a specific level is requested or if current words are for a different level, fetch it
      if (targetLang && targetLevel) {
        setLanguage(targetLang);
        setLevel(targetLevel);
        const fetched = await fetchVocabulary(targetLevel, targetLang);
        const levelKey = `${targetLang}-${targetLevel}`;
        const savedForLevel = customWords[levelKey] || [];
        sourceWords = [...fetched, ...savedForLevel];
        setWords(sourceWords);
      } else if (words.length === 0) {
        const fetched = await fetchVocabulary(activeLevel, activeLang);
        const levelKey = `${activeLang}-${activeLevel}`;
        const savedForLevel = customWords[levelKey] || [];
        sourceWords = [...fetched, ...savedForLevel];
        setWords(sourceWords);
      }

      if (type === 'flashcards') {
        const sortedWords = [...sourceWords].sort((a, b) => {
          const aMistakes = mistakes.filter(m => m.id === a.id).length;
          const bMistakes = mistakes.filter(m => m.id === b.id).length;
          return bMistakes - aMistakes;
        });
        setWords(sortedWords);
        setView('flashcards');
        setFlashcardIndex(0);
        setIsFlipped(false);
        setIsSlideshowActive(false);
        setTestMode(false);
      } else if (type === 'listening') {
        setTestMode(true);
        setView('listening');
        const testData = await generateListeningTest(sourceWords, activeLang);
        setQuestions(testData);
        setCurrentQuestionIndex(0);
        setUserAnswers([]);
        setTestResult(null);
      } else {
        setTestMode(true);
        setView('test');
        const testData = await generateTest(sourceWords, activeLang, type as any);
        setQuestions(testData);
        setCurrentQuestionIndex(0);
        setUserAnswers([]);
        setTestResult(null);
      }
    } catch (error) {
      console.error("Error generating practice:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAdd = async () => {
    if (!quickAddInput.includes('-')) {
      alert("Vui lòng nhập định dạng: [Từ vựng] - [Cấp độ/Chủ đề]");
      return;
    }
    setIsQuickAdding(true);
    try {
      const processed = await processNewWord(quickAddInput);
      setQuickAddPreview(processed);
    } catch (error) {
      console.error("Error quick adding:", error);
    } finally {
      setIsQuickAdding(false);
    }
  };

  const confirmQuickAdd = async () => {
    if (quickAddPreview && user) {
      const levelKey = `${language}-${level}`;
      const wordWithStatus = { 
        ...quickAddPreview, 
        status: 'Chưa thuộc' as const,
        language,
        level,
        createdAt: new Date().toISOString()
      };
      
      const docRef = await addDoc(collection(db, 'users', user.uid, 'customWords'), wordWithStatus);
      const wordWithId = { ...wordWithStatus, id: docRef.id };

      setCustomWords(prev => ({
        ...prev,
        [levelKey]: [...(prev[levelKey] || []), wordWithId]
      }));
      setWords(prev => [...prev, wordWithId]);
      
      // Update study log: wordsLearned
      const today = new Date().toISOString().split('T')[0];
      const logRef = doc(db, 'users', user.uid, 'studyLogs', today);
      await updateDoc(logRef, {
        wordsLearned: [...(todayLog?.wordsLearned || []), wordWithId.id]
      });
      setTodayLog(prev => prev ? { ...prev, wordsLearned: [...prev.wordsLearned, wordWithId.id] } : null);

      setQuickAddPreview(null);
      setQuickAddInput('');
    }
  };

  const updateWordStatus = async (id: string, newStatus: VocabularyItem['status']) => {
    if (!user) return;
    
    // Check if it's a custom word
    const isCustom = Object.values(customWords).flat().some(w => w.id === id);
    if (isCustom) {
      const wordRef = doc(db, 'users', user.uid, 'customWords', id);
      await updateDoc(wordRef, { status: newStatus });
    }

    const updateInList = (list: VocabularyItem[]) => 
      list.map(w => w.id === id ? { ...w, status: newStatus } : w);

    setWords(prev => updateInList(prev));
    setCustomWords(prev => {
      const newCustom = { ...prev };
      Object.keys(newCustom).forEach(key => {
        newCustom[key] = updateInList(newCustom[key]);
      });
      return newCustom;
    });
  };

  const deleteWord = async (id: string, isFromCustom: boolean) => {
    if (confirm("Bạn có chắc chắn muốn xóa từ vựng này không?")) {
      const levelKey = `${language}-${level}`;
      if (isFromCustom && user) {
        await setDoc(doc(db, 'users', user.uid, 'customWords', id), {}, { merge: false }); // Or deleteDoc
        // Better use deleteDoc
        const { deleteDoc } = await import('firebase/firestore');
        await deleteDoc(doc(db, 'users', user.uid, 'customWords', id));

        setCustomWords(prev => ({
          ...prev,
          [levelKey]: (prev[levelKey] || []).filter(w => w.id !== id)
        }));
      }
      setWords(prev => prev.filter(w => w.id !== id));
    }
  };

  const exportToJson = () => {
    const allCustomWords = Object.values(customWords).flat();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allCustomWords, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "smartlingua_growth_vault.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleAnswer = async (answer: string) => {
    const correct = answer.toLowerCase().trim() === questions[currentQuestionIndex].answer.toLowerCase().trim();
    setLastCorrect(correct);
    setIsCorrectionVisible(true);
    
    // Save mistake if wrong
    if (!correct) {
      const currentWordInQuestion = words.find(w => questions[currentQuestionIndex].question.includes(w.word) || questions[currentQuestionIndex].answer.includes(w.word));
      if (currentWordInQuestion) {
        setMistakes(prev => [...prev, currentWordInQuestion]);
      }
    } else {
      // If correct, mark in study log as reviewed
      if (user && todayLog) {
        const currentWordInQuestion = words.find(w => 
          questions[currentQuestionIndex].question.includes(w.word) || 
          questions[currentQuestionIndex].answer.includes(w.word)
        );
        if (currentWordInQuestion) {
          // Automatic status upgrade
          let nextStatus: VocabularyItem['status'] = currentWordInQuestion.status;
          if (currentWordInQuestion.status === 'Chưa thuộc') nextStatus = 'Cần luyện tập';
          else if (currentWordInQuestion.status === 'Cần luyện tập') nextStatus = 'Đã thuộc';
          
          if (nextStatus !== currentWordInQuestion.status) {
            await updateWordStatus(currentWordInQuestion.id, nextStatus);
          }

          if (!todayLog.wordsReviewed.includes(currentWordInQuestion.id)) {
            const logRef = doc(db, 'users', user.uid, 'studyLogs', todayLog.date);
            await updateDoc(logRef, {
              wordsReviewed: [...todayLog.wordsReviewed, currentWordInQuestion.id]
            });
            setTodayLog(prev => prev ? { ...prev, wordsReviewed: [...prev.wordsReviewed, currentWordInQuestion.id] } : null);
          }
        }
      }
    }
  };

  const handleNextQuestion = () => {
    setIsCorrectionVisible(false);
    const newAnswers = [...userAnswers, questions[currentQuestionIndex].answer];
    setUserAnswers(newAnswers);

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      const calculatedScore = userAnswers.length + (lastCorrect ? 1 : 0);
      setTestResult({ score: calculatedScore, total: questions.length });
    }
  };

  const addPersonalWord = async () => {
    if (!user) return;
    const word: VocabularyItem = {
      ...newWord,
      id: Math.random().toString(36).substr(2, 9),
      mistakeCount: 0,
      status: 'Chưa thuộc',
      level,
      language,
      examples: newWord.examples.map(ex => ({ ...ex }))
    };
    
    const docRef = await addDoc(collection(db, 'users', user.uid, 'customWords'), word);
    const wordWithId = { ...word, id: docRef.id };

    const levelKey = `${language}-${level}`;
    setCustomWords(prev => ({
      ...prev,
      [levelKey]: [...(prev[levelKey] || []), wordWithId]
    }));
    setWords(prev => [...prev, wordWithId]);
    setIsModalOpen(false);
    setNewWord({ 
      word: '', 
      pronunciation: '', 
      meaning: '', 
      partOfSpeech: 'noun', 
      grammar: '', 
      label: 'Daily',
      caption: '',
      examples: [{ target: '', vietnamese: '' }, { target: '', vietnamese: '' }] 
    });
  };

  const [ieltsBands, setIeltsBands] = useState(['Band 5.0 (Foundation)', 'Band 6.0 (Transition)', 'Band 7.0+ (Academic)', 'IELTS Academic Writing']);
  const [openAccordion, setOpenAccordion] = useState<string | null>('hsk');

  const hskLevels = ['HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6', 'HSK 7'];
  const hsk1Lessons = Array.from({ length: 15 }, (_, i) => `HSK 1 (Bài ${i + 1})`);
  const hsk2Lessons = Array.from({ length: 15 }, (_, i) => `HSK 2 (Bài ${i + 1})`);
  const hsk3Lessons = Array.from({ length: 20 }, (_, i) => `HSK 3 (Bài ${i + 1})`);
  const toeicLevels = ['Economy', 'Office', 'Travel', 'Workplace', 'Part 1-4', 'Part 5-7'];
  const businessTopics = ['Marketing', 'E-commerce', 'Financial Terms'];

  const toggleAccordion = (id: string) => {
    setOpenAccordion(openAccordion === id ? null : id);
  };

  return (
    <div className="flex h-screen bg-natural-bg overflow-hidden font-sans text-slate-800 relative">
      {/* Mobile Toggle */}
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="fixed bottom-6 right-6 z-50 p-4 bg-natural-primary text-white rounded-full shadow-2xl lg:hidden flex items-center justify-center"
      >
        {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-natural-sidebar border-r border-stone-200 flex flex-col shadow-sm transition-transform duration-300 transform lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-natural-primary flex items-center justify-center text-white font-serif italic text-xl shadow-lg shadow-natural-primary/20">
            T
          </div>
          <div>
            <h1 className="text-xl font-bold text-natural-primary font-serif italic tracking-tight">
              Smartlingua
            </h1>
            <p className="text-[10px] text-stone-400 uppercase tracking-[0.2em] font-bold">Tyanna</p>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-6 overflow-y-auto pt-4">
          {!user ? (
            <div className="px-3 py-4 bg-white rounded-xl border border-dashed border-stone-200">
               <p className="text-[10px] font-bold text-stone-400 uppercase mb-3">Tài khoản</p>
               <button 
                 onClick={handleLogin}
                 className="w-full flex items-center justify-center gap-2 py-2.5 bg-natural-primary text-white text-xs font-bold rounded-lg shadow-sm hover:bg-natural-accent transition-all"
               >
                 <LogIn size={16} /> Đăng nhập Google
               </button>
            </div>
          ) : (
            <div>
              <button 
                onClick={() => setView('dashboard')}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${view === 'dashboard' ? 'bg-white text-natural-primary shadow-sm border border-stone-100' : 'text-stone-500 hover:text-natural-primary'}`}
              >
                <LayoutDashboard size={18} /> Dashboard
              </button>
            </div>
          )}

          <div>
             <button 
               onClick={() => toggleAccordion('hsk')}
               className="w-full flex items-center justify-between px-3 text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mb-3 hover:text-natural-primary transition-colors"
             >
               Chinese HSK {openAccordion === 'hsk' ? '▾' : '▸'}
             </button>
             {openAccordion === 'hsk' && (
               <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="space-y-1 overflow-hidden">
                 {hskLevels.map(hsk => (
                   <div key={hsk}>
                     <button 
                       onClick={() => { 
                         if (isPremiumLocked(undefined, 'Chinese', hsk)) {
                           setIsPremiumModalOpen(true);
                         } else {
                           handleNavigate('vocabulary', hsk, 'Chinese', false); 
                            setIsSidebarOpen(false);                         }
                       }}
                       className={`w-full flex items-center justify-between px-3 py-1.5 text-sm transition-colors ${language === 'Chinese' && level.startsWith(hsk) && view === 'vocabulary' ? 'text-natural-primary font-bold' : 'text-stone-500 hover:text-natural-primary'}`}
                     >
                       <div className="flex items-center gap-3"><BookOpen size={16} /> {hsk}</div>
                       {!userProfile?.isPremium && !['HSK 1', 'HSK 2'].includes(hsk) && <span className="text-[10px]">🔒</span>}
                     </button>
                   </div>
                 ))}
               </motion.div>
             )}
          </div>

          <div>
             <button 
               onClick={() => toggleAccordion('exam')}
               className="w-full flex items-center justify-between px-3 text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mb-3 hover:text-natural-primary transition-colors"
             >
               English Exam {openAccordion === 'exam' ? '▾' : '▸'}
             </button>
             {openAccordion === 'exam' && (
               <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="space-y-4 overflow-hidden pt-1">
                  <div className="space-y-1">
                     <p className="px-3 text-[9px] font-bold text-stone-300 uppercase underline decoration-stone-200">TOEIC Exam</p>
                     {toeicLevels.map(t => (
                       <button 
                         key={t}
                         onClick={() => { 
                           const lockInfo = getLockedItemInfo(undefined, 'TOEIC', t);
                           if (lockInfo) {
                             setLockedItemInfo(lockInfo);
                             setIsPremiumModalOpen(true);
                           } else {
                             handleNavigate('vocabulary', t, 'TOEIC', false); 
                           }
                         }}
                         className={`w-full flex items-center justify-between px-3 py-1.5 text-sm transition-colors ${language === 'TOEIC' && level === t && view === 'vocabulary' ? 'text-natural-primary font-bold' : 'text-stone-500 hover:text-natural-primary'}`}
                       >
                         <div className="flex items-center gap-3 truncate max-w-[120px]"><GraduationCap size={16} /> {t}</div>
                         {isPremiumLocked(undefined, 'TOEIC', t) && <span className="text-[10px]">🔒</span>}
                       </button>
                     ))}
                  </div>
                  <div className="space-y-1">
                     <p className="px-3 text-[9px] font-bold text-stone-300 uppercase underline decoration-stone-200">IELTS Prep</p>
                     {ieltsBands.map(i => (
                       <button 
                         key={i}
                         onClick={() => { 
                           const lockInfo = getLockedItemInfo(undefined, 'IELTS', i);
                           if (lockInfo) {
                             setLockedItemInfo(lockInfo);
                             setIsPremiumModalOpen(true);
                           } else {
                             handleNavigate('vocabulary', i, 'IELTS', false); 
                           }
                         }}
                         className={`w-full flex items-center justify-between px-3 py-1.5 text-sm transition-colors ${language === 'IELTS' && level === i && view === 'vocabulary' ? 'text-natural-primary font-bold' : 'text-stone-500 hover:text-natural-primary'}`}
                       >
                         <div className="flex items-center gap-3 truncate max-w-[120px]"><BrainCircuit size={16} /> {i}</div>
                         {isPremiumLocked(undefined, 'IELTS', i) && <span className="text-[10px]">🔒</span>}
                       </button>
                     ))}
                  </div>
               </motion.div>
             )}
          </div>

          <div>
            <button 
               onClick={() => toggleAccordion('business')}
               className="w-full flex items-center justify-between px-3 text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mb-3 hover:text-natural-primary transition-colors"
             >
               Business English {openAccordion === 'business' ? '▾' : '▸'}
             </button>
            {openAccordion === 'business' && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="space-y-1 overflow-hidden">
                {businessTopics.map(topic => (
                  <button 
                    key={topic}
                    onClick={() => { 
                      const lockInfo = getLockedItemInfo(undefined, 'English', topic);
                      if (lockInfo) {
                        setLockedItemInfo(lockInfo);
                        setIsPremiumModalOpen(true);
                      } else {
                        handleNavigate('vocabulary', topic, 'English', false); 
                      }
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-sm transition-colors ${language === 'English' && level === topic && view === 'vocabulary' ? 'text-natural-primary font-bold' : 'text-stone-500 hover:text-natural-primary'}`}
                  >
                    <div className="flex items-center gap-3"><Languages size={16} /> {topic}</div>
                    {!userProfile?.isPremium && <span className="text-[10px]">🔒</span>}
                  </button>
                ))}
              </motion.div>
            )}
          </div>

          <div>
            <button 
               onClick={() => toggleAccordion('practice')}
               className="w-full flex items-center justify-between px-3 text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mb-3 hover:text-natural-primary transition-colors"
             >
               Luyện tập {openAccordion === 'practice' ? '▾' : '▸'}
             </button>
            {openAccordion === 'practice' && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="space-y-1 overflow-hidden">
                <button 
                  onClick={() => { setSelectedPracticeType('flashcards'); setView('practice_hub'); setTestMode(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-1.5 text-sm transition-colors ${view === 'practice_hub' && selectedPracticeType === 'flashcards' ? 'text-natural-primary font-bold' : view === 'flashcards' ? 'text-natural-primary font-bold' : 'text-stone-500 hover:text-natural-primary'}`}
                >
                  <SquareStack size={16} /> Thẻ ghi nhớ
                </button>
                <button 
                  onClick={() => { setSelectedPracticeType('listening'); setView('practice_hub'); setTestMode(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-1.5 text-sm transition-colors ${view === 'practice_hub' && selectedPracticeType === 'listening' ? 'text-natural-primary font-bold' : view === 'listening' ? 'text-natural-primary font-bold' : 'text-stone-500 hover:text-natural-primary'}`}
                >
                  <Volume2 size={16} /> Luyện nghe
                </button>
                <button 
                  onClick={() => { 
                    const lockInfo = getLockedItemInfo('translation');
                    if (lockInfo) {
                      setLockedItemInfo(lockInfo);
                      setIsPremiumModalOpen(true);
                    } else {
                      setSelectedPracticeType('translation'); setView('practice_hub'); setTestMode(false); 
                    }
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-sm transition-colors ${view === 'practice_hub' && selectedPracticeType === 'translation' ? 'text-natural-primary font-bold' : 'text-stone-500 hover:text-natural-primary'}`}
                >
                  <div className="flex items-center gap-3"><Languages size={16} /> Viết câu</div>
                  {!userProfile?.isPremium && <span className="text-[10px]">🔒</span>}
                </button>
                <button 
                  onClick={() => { 
                    const lockInfo = getLockedItemInfo('ordering');
                    if (lockInfo) {
                      setLockedItemInfo(lockInfo);
                      setIsPremiumModalOpen(true);
                    } else {
                      setSelectedPracticeType('ordering'); setView('practice_hub'); setTestMode(false); 
                    }
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-sm transition-colors ${view === 'practice_hub' && selectedPracticeType === 'ordering' ? 'text-natural-primary font-bold' : 'text-stone-500 hover:text-natural-primary'}`}
                >
                  <div className="flex items-center gap-3"><RotateCcw size={16} /> Sắp xếp câu</div>
                  {!userProfile?.isPremium && <span className="text-[10px]">🔒</span>}
                </button>
                <button 
                  onClick={handleStartFluency}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-sm transition-colors ${view === 'fluency' ? 'text-natural-primary font-bold' : 'text-stone-500 hover:text-natural-primary'}`}
                >
                  <div className="flex items-center gap-3"><Mic size={16} /> Luyện nói</div>
                  {isPremiumLocked('fluency') && <span className="text-[10px]">🔒</span>}
                </button>
              </motion.div>
            )}
          </div>
        </nav>

        <div className="p-6 border-t border-stone-100">
           {user ? (
             <div className="space-y-4">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-stone-100">
                   <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-full bg-natural-sidebar flex items-center justify-center">
                         <UserIcon size={14} className="text-natural-primary" />
                      </div>
                      <div className="flex-1 overflow-hidden">
                         <p className="text-[10px] font-bold text-stone-800 truncate">{userProfile?.displayName}</p>
                         <p className="text-[8px] text-stone-400 truncate">{userProfile?.email}</p>
                      </div>
                   </div>
                   <button 
                     onClick={handleLogout}
                     className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-rose-500 bg-rose-50 rounded-lg hover:bg-rose-100 transition-colors"
                   >
                     <LogOut size={14} /> Đăng xuất
                   </button>
                </div>
                <div className="bg-natural-primary rounded-xl p-4 text-white shadow-lg shadow-natural-primary/20">
                   <p className="text-[9px] uppercase font-bold opacity-60 mb-2 tracking-widest">Thời gian học</p>
                   <div className="flex items-center gap-2">
                      <Clock size={16} />
                      <span className="text-lg font-bold">{userProfile?.totalStudyTime || 0} phút</span>
                   </div>
                </div>
             </div>
           ) : (
             <div className="text-center p-4 bg-stone-50 rounded-xl border border-stone-100">
                <p className="text-[10px] font-medium text-stone-500 italic">Đăng nhập để lưu tiến độ và học trên nhiều thiết bị</p>
             </div>
           )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full bg-natural-bg relative min-w-0">
        <header className="px-4 lg:px-8 py-4 lg:py-6 border-b border-stone-200 flex flex-col lg:flex-row items-stretch lg:items-center justify-between bg-natural-bg sticky top-0 z-10 gap-4">
          <div className="flex items-center gap-4 flex-1">
            {view !== 'dashboard' && (
              <button 
                onClick={goBack}
                className="p-2 rounded-full bg-stone-100 text-stone-500 hover:bg-natural-sidebar hover:text-natural-primary transition-all flex items-center gap-2 group"
                title="Quay lại lần trước"
              >
                <RotateCcw size={20} className="group-hover:-rotate-90 transition-transform duration-300" />
                <span className="text-xs font-bold pr-2 hidden sm:inline">QUAY LẠI</span>
              </button>
            )}
            <form onSubmit={handleSearch} className="flex-1 relative group">
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={view === 'dashboard' ? "Tìm kiếm đa năng [Anh | Trung | Việt]..." : `Tìm trong kho ${language}...`}
                className="w-full pl-12 pr-4 py-2.5 rounded-full border border-stone-200 focus:ring-2 focus:ring-natural-accent outline-none bg-white/50 backdrop-blur-sm transition-all focus:bg-white"
              />
              <Languages className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 group-focus-within:text-natural-accent" size={18} />
              {isSearching && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-natural-accent border-t-transparent rounded-full animate-spin" />}
            </form>
          </div>
          
          <div className="flex items-center justify-between gap-4 overflow-x-auto pb-1 lg:pb-0 scrollbar-hide">
            {userProfile && (
              <div className="flex items-center gap-4 px-4 py-2 bg-orange-50 rounded-full border border-orange-100 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xl font-bold text-orange-600">🔥 {userProfile.fireStreak || 0}</span>
                  <button 
                    onClick={handleRedeemStreak}
                    className="text-[10px] bg-orange-600 text-white px-2 py-0.5 rounded-full font-bold hover:bg-orange-700 transition-colors"
                  >
                    ĐỔI THƯỞNG
                  </button>
                </div>
              </div>
            )}
            <div className="text-right hidden xl:block">
              <p className="text-[10px] font-bold text-natural-primary uppercase tracking-widest">{getCurrentMessage().includes('Gần 11h') ? 'Work Shift Reminder' : 'Daily Schedule'}</p>
              <p className={`text-sm font-semibold transition-colors ${getCurrentMessage().includes('Gần 11h') ? 'text-rose-500' : 'text-natural-primary'}`}>
                {getCurrentMessage().includes('Gần 11h') ? 'Văn phòng / Shop' : '09:00 — 11:00 AM'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!userProfile?.isPremium && (
                <button 
                  onClick={() => setIsPremiumModalOpen(true)}
                  className="px-6 py-2 bg-rose-100 text-rose-500 text-sm rounded-full font-bold hover:bg-rose-200 transition-all border border-rose-200"
                >
                  Nạp tiền Premium
                </button>
              )}
              <button 
                onClick={() => handleStartTest()}
                disabled={loading}
                className="px-6 py-2 bg-natural-accent text-white text-sm rounded-full font-bold hover:bg-natural-primary transition-all shadow-sm disabled:opacity-50"
              >
                Kiểm tra ngay
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8 relative">
          <AnimatePresence mode="wait">
            {searchResults ? (
              <motion.div 
                key="search-results"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-4xl mx-auto space-y-8"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-serif italic text-natural-primary">Kết quả tìm kiếm cho "{searchQuery}"</h3>
                  <button onClick={() => setSearchResults(null)} className="text-sm font-bold text-stone-400 hover:text-stone-600 flex items-center gap-2">
                    <LogOut size={16} /> Đóng kết quả
                  </button>
                </div>

                {searchResults.vietnamese ? (
                  // Global Search Display
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-2xl border border-stone-100 shadow-sm text-center">
                       <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Tiếng Việt</span>
                       <h4 className="text-2xl font-bold mt-2 text-stone-800">{searchResults.vietnamese.word}</h4>
                       <p className="text-sm text-stone-500 mt-2 italic">{searchResults.vietnamese.definition}</p>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-stone-100 shadow-sm text-center">
                       <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Tiếng Anh</span>
                       <h4 className="text-2xl font-bold mt-2 text-stone-800">{searchResults.english.word}</h4>
                       <p className="text-xs font-mono text-stone-400">{searchResults.english.pronunciation}</p>
                       <p className="text-sm text-stone-500 mt-2 italic">{searchResults.english.definition}</p>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-stone-100 shadow-sm text-center">
                       <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Tiếng Trung</span>
                       <h4 className="text-2xl font-bold mt-2 text-stone-800">{searchResults.chinese.word}</h4>
                       <p className="text-xs font-mono text-stone-400">{searchResults.chinese.pinyin}</p>
                       <p className="text-sm text-stone-500 mt-2 italic">{searchResults.chinese.definition}</p>
                    </div>
                  </div>
                ) : (
                  // Local Search Display
                  <div className="bg-white p-8 rounded-2xl border border-stone-100 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                       <div>
                          <h4 className="text-3xl font-bold text-stone-800">{searchResults.word}</h4>
                          <p className="text-stone-400 font-mono italic">{searchResults.pronunciation} • {searchResults.partOfSpeech}</p>
                       </div>
                       <div className="text-right">
                          <span className="text-xs bg-natural-sidebar text-natural-primary px-3 py-1 rounded-full font-bold">{language} Library</span>
                       </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="space-y-4">
                          <div>
                             <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Ý nghĩa</p>
                             <p className="text-lg text-stone-700">{searchResults.meaning}</p>
                          </div>
                          <div>
                             <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Ngữ pháp</p>
                             <p className="text-sm text-stone-600 leading-relaxed italic">{searchResults.grammar}</p>
                          </div>
                       </div>
                       <div>
                          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Ví dụ trong ngữ cảnh</p>
                          <div className="space-y-3">
                             {searchResults.examples?.map((ex: any, i: number) => (
                               <div key={i} className="p-3 bg-stone-50 rounded-xl border border-stone-100">
                                  <p className="text-sm font-medium text-stone-800">{ex.target}</p>
                                  <p className="text-xs text-stone-500 italic mt-1">{ex.vietnamese}</p>
                               </div>
                             ))}
                          </div>
                       </div>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : searchError ? (
               <motion.div 
                key="search-error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="max-w-xl mx-auto bg-rose-50 p-8 rounded-2xl border border-rose-100 text-center space-y-4"
              >
                 <XCircle size={48} className="mx-auto text-rose-500" />
                 <h4 className="text-xl font-bold text-rose-800">Rất tiếc!</h4>
                 <p className="text-rose-600 italic font-serif italic text-lg leading-relaxed">“{searchError}”</p>
                 <button 
                  onClick={() => { setSearchError(null); setView('dashboard'); }}
                  className="px-6 py-2 bg-rose-500 text-white rounded-full font-bold text-sm hover:bg-rose-600 transition-colors"
                >
                  Quay ra Trang chủ
                 </button>
              </motion.div>
            ) : loading ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center h-full gap-4"
              >
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500 animate-pulse">Tyanna đang tải dữ liệu thông minh...</p>
              </motion.div>
            ) : testMode ? (
              <motion.div 
                key="test"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-3xl mx-auto"
              >
                {testResult ? (
                  <div className="text-center space-y-6">
                    <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-blue-100 text-blue-600 mb-4">
                      <span className="text-3xl font-bold">{Math.round((testResult.score / testResult.total) * 100)}%</span>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800">Kết quả bài kiểm tra</h3>
                    <p className="text-gray-600">Bạn đã trả lời đúng {testResult.score} / {testResult.total} câu hỏi.</p>
                    <button 
                      onClick={() => setTestMode(false)}
                      className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      Quay lại học từ vựng
                    </button>
                  </div>
                ) : questions.length > 0 ? (
                  <div className="space-y-8">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Câu hỏi {currentQuestionIndex + 1} / {questions.length}</span>
                      <div className="h-2 w-48 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 transition-all duration-300" 
                          style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
                        />
                      </div>
                    </div>

                    <div className="bg-white border border-stone-100 rounded-2xl p-10 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-natural-accent opacity-20" />
                      
                      {questions[currentQuestionIndex].type === 'listening' && (
                        <div className="flex justify-center mb-8">
                          <button 
                            onClick={() => playAudio(questions[currentQuestionIndex].audioText || '', language)}
                            className="w-20 h-20 rounded-full bg-natural-bg text-natural-primary flex items-center justify-center hover:bg-natural-primary hover:text-white transition-all shadow-lg group"
                          >
                            <Volume2 size={32} className="group-hover:scale-110 transition-transform" />
                          </button>
                        </div>
                      )}

                      <h4 className="text-2xl font-serif text-natural-primary italic mb-8 text-center">
                        {questions[currentQuestionIndex].type === 'ordering' ? (
                          <div className="space-y-4">
                             <p className="text-sm uppercase tracking-widest text-stone-400 font-bold mb-2">Sắp xếp các từ sau thành câu đúng:</p>
                             <div className="flex flex-wrap justify-center gap-2">
                               {questions[currentQuestionIndex].question.split(' ').sort(() => Math.random() - 0.5).map((word, i) => (
                                 <span key={i} className="px-3 py-1 bg-stone-100 rounded-lg text-stone-600 border border-stone-200 font-sans not-italic text-base">
                                   {word}
                                 </span>
                               ))}
                             </div>
                          </div>
                        ) : questions[currentQuestionIndex].question}
                      </h4>

                      {!isCorrectionVisible ? (
                        questions[currentQuestionIndex].type === 'multiple-choice' ? (
                          <div className="grid grid-cols-1 gap-4">
                            {questions[currentQuestionIndex].options?.map((option, idx) => (
                              <button 
                                key={idx}
                                onClick={() => handleAnswer(option)}
                                className="text-left px-6 py-5 rounded-xl border border-stone-100 hover:border-natural-accent hover:bg-natural-bg transition-all text-sm font-medium group flex items-center gap-4"
                              >
                                <span className="inline-flex w-10 h-10 rounded-full bg-stone-50 group-hover:bg-natural-accent group-hover:text-white text-stone-400 text-xs font-bold items-center justify-center transition-colors">
                                  {String.fromCharCode(65 + idx)}
                                </span>
                                <span className="text-stone-700">{option}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <input 
                              type="text" 
                              autoFocus
                              className="w-full px-6 py-4 rounded-xl border border-stone-100 focus:ring-2 focus:ring-natural-accent outline-none bg-stone-50/50 text-lg font-medium"
                              placeholder={questions[currentQuestionIndex].type === 'ordering' ? "Nhập câu đã sắp xếp..." : "Nhập câu dịch của bạn..."}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleAnswer((e.target as HTMLInputElement).value);
                                  (e.target as HTMLInputElement).value = '';
                                }
                              }}
                            />
                            <p className="text-xs text-stone-400 uppercase tracking-widest font-bold">Nhấn Enter để gửi đáp án</p>
                          </div>
                        )
                      ) : (
                        <div className="space-y-8">
                          <div className={`p-6 rounded-xl flex items-center gap-6 border ${lastCorrect ? 'bg-emerald-50/50 text-emerald-800 border-emerald-100' : 'bg-rose-50/50 text-rose-800 border-rose-100'}`}>
                            {lastCorrect ? <CheckCircle2 size={32} /> : <XCircle size={32} />}
                            <div>
                              <p className="text-xl font-bold mb-1">{lastCorrect ? 'Chính xác hoàn hảo!' : 'Cần cố gắng thêm một chút...'}</p>
                              <p className="text-sm font-mono opacity-70">ĐÁP ÁN ĐÚNG: <span className="bg-white/50 px-2 py-0.5 rounded">{questions[currentQuestionIndex].answer}</span></p>
                            </div>
                          </div>
                          
                          <div className="bg-stone-50 p-6 rounded-xl border border-stone-100">
                             <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-3">Lời khuyên từ TYANNA</p>
                             <div className="text-stone-700 leading-relaxed font-serif italic text-lg">
                               “{questions[currentQuestionIndex].explanation}”
                             </div>
                          </div>

                          <button 
                            onClick={handleNextQuestion}
                            className="w-full py-5 bg-natural-primary text-white rounded-xl font-bold hover:bg-natural-accent transition-all flex items-center justify-center gap-3 shadow-lg shadow-natural-primary/10"
                          >
                            Câu hỏi tiếp theo <ChevronRight size={20} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </motion.div>
            ) : view === 'flashcards' ? (
              <motion.div 
                key="flashcards"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-2xl mx-auto space-y-8"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-serif italic text-natural-primary">Thẻ ghi nhớ thông minh</h3>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setIsSlideshowActive(!isSlideshowActive)}
                      className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all ${isSlideshowActive ? 'bg-natural-primary text-white' : 'bg-stone-100 text-stone-400 hover:bg-stone-200'}`}
                    >
                      <Clock size={12} className={isSlideshowActive ? 'animate-spin-slow' : ''} />
                      {isSlideshowActive ? 'Đang trình chiếu (5s)' : 'Bật trình chiếu'}
                    </button>
                    <span className="text-xs text-stone-400 font-bold tracking-widest uppercase">
                      Thẻ {flashcardIndex + 1} / {words.length}
                    </span>
                  </div>
                </div>

                {/* Flip Card */}
                <div 
                  className="relative h-[400px] cursor-pointer [perspective:1000px]"
                  onClick={() => setIsFlipped(!isFlipped)}
                >
                  <motion.div 
                    className="relative w-full h-full [transform-style:preserve-3d] transition-all duration-700"
                    animate={{ rotateY: isFlipped ? 180 : 0 }}
                  >
                    {/* Front */}
                    <div className="absolute inset-0 bg-white border border-stone-100 rounded-3xl shadow-xl flex flex-col items-center justify-center [backface-visibility:hidden] p-12 text-center">
                      <div className="absolute top-6 left-6 text-[10px] font-bold text-stone-300 uppercase tracking-widest">Mặt trước</div>
                      <h2 className="text-6xl font-bold text-stone-800 mb-4">{words[flashcardIndex].word}</h2>
                      <p className="text-xl text-natural-primary font-serif italic opacity-60">Nhấn để xem nghĩa — Tyanna</p>
                    </div>

                    {/* Back */}
                    <div className="absolute inset-0 bg-white border border-stone-100 rounded-3xl shadow-xl flex flex-col [backface-visibility:hidden] [transform:rotateY(180deg)] overflow-hidden">
                       <div className="bg-natural-sidebar p-6 border-b border-stone-100 flex items-center justify-between">
                         <div className="text-[10px] font-bold text-natural-primary uppercase tracking-widest">Mặt sau — Chi tiết</div>
                         <button 
                           onClick={(e) => { e.stopPropagation(); playAudio(words[flashcardIndex].word, language); }}
                           className="p-2 rounded-full hover:bg-white transition-colors text-natural-primary"
                         >
                           <Volume2 size={20} />
                         </button>
                       </div>
                       <div className="p-8 flex-1 overflow-y-auto space-y-6">
                         <div className="flex justify-between items-start">
                            <div>
                              <p className="text-2xl font-serif italic text-natural-primary mb-1">{words[flashcardIndex].pronunciation}</p>
                              <p className="text-xl font-bold text-stone-800">{words[flashcardIndex].meaning}</p>
                            </div>
                            <span className="px-2 py-1 bg-stone-100 rounded text-[10px] font-bold text-stone-400 uppercase tracking-widest">{words[flashcardIndex].partOfSpeech}</span>
                         </div>

                         <div className="space-y-4">
                            <div className="p-4 bg-natural-bg rounded-xl border border-stone-100">
                               <p className="text-[10px] font-bold text-natural-primary uppercase mb-2">Ngữ pháp</p>
                               <p className="text-sm font-semibold text-stone-700">{words[flashcardIndex].grammar}</p>
                            </div>

                            <div className="space-y-3">
                               <p className="text-[10px] font-bold text-stone-300 uppercase">Ví dụ thực tế</p>
                               {words[flashcardIndex].examples.map((ex, i) => (
                                 <div key={i} className="text-sm border-l-2 border-natural-accent pl-4 py-1">
                                    <p className="text-stone-800 font-medium">{ex.target}</p>
                                    <p className="text-stone-400 italic text-xs">{ex.vietnamese}</p>
                                 </div>
                               ))}
                            </div>
                         </div>
                       </div>
                    </div>
                  </motion.div>
                </div>

                <div className="flex items-center justify-center gap-6">
                   <button 
                     onClick={() => { setFlashcardIndex(prev => Math.max(0, prev - 1)); setIsFlipped(false); }}
                     disabled={flashcardIndex === 0}
                     className="p-4 rounded-full bg-white border border-stone-100 shadow-sm text-stone-400 hover:text-natural-primary disabled:opacity-30 transition-colors"
                   >
                     <ChevronRight size={24} className="rotate-180" />
                   </button>
                   <button 
                     onClick={() => { setFlashcardIndex(0); setIsFlipped(false); }}
                     className="p-4 rounded-full bg-white border border-stone-100 shadow-sm text-stone-400 hover:text-natural-primary transition-colors"
                   >
                     <RotateCcw size={24} />
                   </button>
                   <button 
                     onClick={() => {
                        if (flashcardIndex < words.length - 1) {
                          setFlashcardIndex(flashcardIndex + 1);
                          setIsFlipped(false);
                        } else {
                          setView('dashboard');
                        }
                     }}
                     className="p-4 rounded-xl bg-natural-primary text-white shadow-lg shadow-natural-primary/20 flex items-center gap-2 font-bold px-8"
                   >
                     {flashcardIndex === words.length - 1 ? "Hoàn thành" : "Thẻ tiếp theo"} <ChevronRight size={20} />
                   </button>
                </div>
              </motion.div>
            ) : view === 'vocabulary' ? (
              <motion.div 
                key="vocab"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {language === 'Chinese' && (level.startsWith('HSK 1 (') || level.startsWith('HSK 2 (') || level.startsWith('HSK 3 (')) && (
                      <button 
                        onClick={() => {
                          const hskLvl = level.split(' (')[0];
                          setLevel(hskLvl);
                        }}
                        className="p-2 rounded-full bg-stone-100 text-stone-500 hover:bg-natural-sidebar hover:text-natural-primary transition-colors"
                      >
                        <ChevronRight size={20} className="rotate-180" />
                      </button>
                    )}
                    <h3 className="text-xl font-serif italic text-natural-primary">
                      {language === 'Chinese' && level === 'HSK 1' ? 'Lộ trình HSK 1 — 15 Bài học cơ bản' : 
                       language === 'Chinese' && level === 'HSK 2' ? 'Lộ trình HSK 2 — 15 Bài học mở rộng' :
                       language === 'Chinese' && level === 'HSK 3' ? 'Lộ trình HSK 3 — 20 Bài học nâng cao' :
                       language === 'Chinese' && level.startsWith('HSK 1 (') ? `HSK 1 — ${HSK1_TITLES[parseInt(level.match(/Bài (\d+)/)?.[1] || '1')]}` :
                       language === 'Chinese' && level.startsWith('HSK 2 (') ? `HSK 2 — ${HSK2_TITLES[parseInt(level.match(/Bài (\d+)/)?.[1] || '1')]}` :
                       language === 'Chinese' && level.startsWith('HSK 3 (') ? `HSK 3 — ${HSK3_TITLES[parseInt(level.match(/Bài (\d+)/)?.[1] || '1')]}` :
                       'Danh sách từ vựng thông minh'}
                    </h3>
                    {(language === 'Chinese' && (level.startsWith('HSK 1 (') || level.startsWith('HSK 2 (') || level.startsWith('HSK 3 ('))) && (
                      <button 
                         onClick={() => handleStartTest('translation')}
                         className="px-4 py-1.5 bg-natural-primary text-white text-[11px] font-bold rounded-full shadow-lg shadow-natural-primary/20 hover:scale-105 transition-all flex items-center gap-2"
                      >
                         <BrainCircuit size={14} /> Kiểm tra ngay Bài {level.match(/Bài (\d+)/)?.[1]}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={exportToJson}
                      className="text-xs font-bold px-4 py-1.5 bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200 transition-colors flex items-center gap-2"
                    >
                      Sao lưu JSON (Sync-ready)
                    </button>
                    <button className="text-xs font-medium px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                      Xuất sang Notion
                    </button>
                    <button className="text-xs font-medium px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                      Xuất sang Sheets
                    </button>
                  </div>
                </div>

                {language === 'Chinese' && (level === 'HSK 1' || level === 'HSK 2' || level === 'HSK 3') ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    {Object.entries(level === 'HSK 1' ? HSK1_TITLES : level === 'HSK 2' ? HSK2_TITLES : HSK3_TITLES).map(([id, title]) => (
                      <motion.div
                        key={id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: parseInt(id) * 0.05 }}
                        className="bg-white rounded-[2rem] border border-stone-100 shadow-sm hover:shadow-2xl hover:border-natural-accent/20 transition-all flex flex-col group relative overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                          <Plus size={120} />
                        </div>
                        
                        <div className="p-8 pb-4">
                          <div className="w-14 h-14 rounded-2xl bg-natural-sidebar text-natural-primary flex items-center justify-center mb-6 group-hover:bg-natural-primary group-hover:text-white transition-all transform group-hover:rotate-6">
                            <span className="text-xl font-black">{id}</span>
                          </div>
                          <h4 className="text-xl font-bold text-stone-800 leading-tight mb-3 group-hover:text-natural-primary transition-colors">{title}</h4>
                          <p className="text-sm text-stone-400 font-medium leading-relaxed">
                            Chinh phục trọn bộ từ vựng & mẫu câu giao tiếp căn bản phần {id}.
                          </p>
                        </div>
                        
                        <div className="p-8 pt-0 mt-auto flex flex-col gap-3">
                          <button 
                            onClick={() => handleNavigate('vocabulary', `${level} (Bài ${id})`)}
                            className="flex items-center justify-center gap-2 w-full py-4 bg-natural-bg text-natural-primary rounded-2xl font-bold text-sm hover:bg-natural-sidebar transition-all border border-stone-100/50"
                          >
                            <BookOpen size={18} /> Học từ vựng
                          </button>
                          <button 
                            onClick={() => {
                              handleNavigate('test', `${level} (Bài ${id})`, 'Chinese', true);
                              handleStartTest('translation', 'Chinese', `${level} (Bài ${id})`);
                            }}
                            className="flex items-center justify-center gap-2 w-full py-4 bg-natural-sidebar text-natural-primary rounded-2xl font-bold text-sm hover:bg-natural-primary hover:text-white transition-all"
                          >
                            <BrainCircuit size={18} /> Luyện tập ngay
                          </button>
                        </div>

                        {/* Progress indicator mockup */}
                        <div className="px-8 pb-8">
                           <div className="h-1.5 w-full bg-stone-50 rounded-full overflow-hidden">
                              <div className="h-full bg-natural-accent transition-all duration-1000" style={{ width: '0%' }}></div>
                           </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <>
                    {/* Quick Add Area - Moved to Top */}
                    <div className="bg-natural-sidebar border border-stone-200 rounded-2xl p-8 mb-8">
                   <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-natural-primary text-white rounded-lg shadow-lg">
                        <Plus size={20} />
                      </div>
                      <h4 className="text-lg font-bold text-natural-primary uppercase tracking-wider">📥 KHU VỰC THÊM TỪ VỰNG MỚI</h4>
                   </div>

                   <p className="text-xs text-stone-500 mb-4 font-medium italic">Tyanna sẽ tự động phân tích và tạo đầy đủ dữ liệu cho bạn. Định dạng: [Từ vựng] - [Cấp độ HSK/Chủ đề Tiếng Anh]</p>
                   
                   <div className="flex gap-4">
                      <input 
                        type="text" 
                        value={quickAddInput}
                        onChange={(e) => setQuickAddInput(e.target.value)}
                        placeholder="e.g. 咖啡 - HSK 1  hoặc  Supply Chain - Marketing"
                        className="flex-1 px-6 py-4 rounded-xl border border-stone-100 bg-white shadow-sm outline-none focus:ring-2 focus:ring-natural-accent text-sm"
                        onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
                      />
                      <button 
                        onClick={handleQuickAdd}
                        disabled={isQuickAdding || !quickAddInput.trim()}
                        className="px-8 bg-natural-primary text-white rounded-xl font-bold shadow-lg shadow-natural-primary/20 hover:bg-natural-accent transition-all disabled:opacity-50"
                      >
                        {isQuickAdding ? 'Đang xử lý AI...' : 'Phân tích ngay'}
                      </button>
                   </div>

                   <AnimatePresence>
                      {quickAddPreview && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-6 bg-white border border-stone-100 rounded-xl p-6 shadow-sm"
                        >
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                              <div>
                                 <div className="flex items-center gap-3 mb-2">
                                    <span className="text-2xl font-bold text-stone-800">{quickAddPreview.word}</span>
                                    <span className="text-sm font-serif italic text-natural-primary">{quickAddPreview.pronunciation}</span>
                                 </div>
                                 <div className="flex items-center gap-2 mt-2">
                                    <span className="font-semibold text-stone-700">{quickAddPreview.meaning}</span>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${
                                      quickAddPreview.label === 'Marketing' ? 'bg-orange-50 text-orange-600 border border-orange-100' :
                                      quickAddPreview.label === 'Work' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                                      'bg-stone-100 text-stone-500'
                                    }`}>
                                      #{quickAddPreview.label}
                                    </span>
                                 </div>
                                 <div className="mt-4 p-4 bg-natural-sidebar rounded-xl border border-stone-200">
                                    <p className="text-[10px] font-bold text-natural-primary uppercase mb-2">Copywriting Challenge (Caption)</p>
                                    <p className="text-sm italic text-stone-600 leading-relaxed font-serif">“{quickAddPreview.caption}”</p>
                                 </div>
                                 <div className="text-xs font-semibold text-stone-800 underline decoration-natural-accent underline-offset-4 mb-2">
                                   {quickAddPreview.grammar}
                                 </div>
                                 {quickAddPreview.examples.map((ex, i) => (
                                    <div key={i} className="text-xs italic text-stone-400">
                                      {ex.target} — {ex.vietnamese}
                                    </div>
                                 ))}
                              </div>
                           </div>
                           <div className="mt-6 pt-6 border-t border-stone-50 flex justify-end">
                              <button 
                                onClick={confirmQuickAdd}
                                className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center gap-2"
                              >
                                <CheckCircle2 size={16} /> Xác nhận thêm vào Database
                              </button>
                           </div>
                        </motion.div>
                      )}
                   </AnimatePresence>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
                  {/* Desktop Table View */}
                  <div className="hidden xl:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                    <thead className="bg-[#FEFDFB] text-[11px] uppercase tracking-widest text-stone-400 border-b border-stone-100">
                      <tr>
                        <th className="px-6 py-4 font-semibold w-16 text-center text-stone-400">STT</th>
                        <th className="px-6 py-4 font-semibold">Từ vựng & Nhãn</th>
                        <th className="px-6 py-4 font-semibold">Nghĩa & Loại từ</th>
                        <th className="px-6 py-4 font-semibold">Ứng dụng (Caption Mẫu)</th>
                        <th className="px-6 py-4 font-semibold">Cấu trúc & Ví dụ</th>
                        <th className="px-6 py-4 font-semibold w-32 text-center">Trạng thái</th>
                        <th className="px-6 py-4 font-semibold text-center w-20">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50 text-stone-600">
                      {words.map((word, idx) => (
                        <tr key={word.id} className="hover:bg-natural-bg transition-colors group">
                          <td className="px-6 py-5 text-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs mx-auto ${
                              idx % 3 === 0 ? 'bg-natural-sidebar text-natural-primary' :
                              idx % 3 === 1 ? 'bg-orange-50 text-orange-600' :
                              'bg-blue-50 text-blue-600'
                            }`}>
                              {idx + 1}
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex flex-col gap-1 relative group/word">
                               <div className="flex items-center gap-3">
                                 <span className="text-3xl filter saturate-[1.2] drop-shadow-sm group-hover/word:scale-110 transition-transform cursor-pointer" onClick={() => playAudio(word.word, language)}>
                                   {getWordIcon(word.word)}
                                 </span>
                                 <div className="flex flex-col">
                                   <div className="flex items-center gap-2">
                                     <span className="text-2xl font-bold text-stone-800 tracking-tight">{word.word}</span>
                                     <button 
                                       onClick={() => playAudio(word.word, language)}
                                       className="p-1 px-2 rounded-lg bg-natural-sidebar text-natural-primary hover:bg-natural-primary hover:text-white transition-colors flex items-center gap-1 text-[10px] font-bold"
                                     >
                                       <Volume2 size={12} /> Phát âm
                                     </button>
                                   </div>
                                   <span className="text-sm font-serif italic text-natural-primary">{word.pronunciation}</span>
                                 </div>
                               </div>
                               {word.label && (
                                 <span className={`w-fit mt-2 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${
                                   word.label === 'Marketing' ? 'bg-orange-50 text-orange-600 border border-orange-100' :
                                   word.label === 'Work' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                                   'bg-stone-100 text-stone-500'
                                 }`}>
                                   #{word.label}
                                 </span>
                               )}
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <span className="inline-block px-2 py-0.5 bg-stone-100 rounded text-[10px] font-bold text-stone-500 uppercase mb-1 mr-2">
                              {word.partOfSpeech}
                            </span>
                            <div className="text-stone-800 font-semibold">{word.meaning}</div>
                          </td>
                          <td className="px-6 py-5 max-w-xs">
                             {word.caption ? (
                               <div className="p-3 bg-stone-50 rounded-xl border border-dashed border-stone-200 text-xs text-stone-600 italic leading-relaxed">
                                 “{word.caption}”
                               </div>
                             ) : (
                               <span className="text-[10px] text-stone-300 italic">Tyanna chưa tạo Caption cho từ này...</span>
                             )}
                          </td>
                          <td className="px-6 py-5">
                            <div className="text-xs font-semibold text-stone-800 underline decoration-natural-accent underline-offset-4 mb-2">
                              {word.grammar}
                            </div>
                            <div className="space-y-2">
                              {word.examples.slice(0, 1).map((ex, i) => (
                                <div key={i} className="text-xs leading-relaxed max-w-sm">
                                   <p className="text-stone-700 font-medium">{ex.target}</p>
                                   <p className="text-stone-400 italic font-serif">{ex.vietnamese}</p>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-5">
                             <select 
                               value={word.status || 'Chưa thuộc'}
                               onChange={(e) => updateWordStatus(word.id, e.target.value as any)}
                               className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border outline-none transition-colors ${
                                 word.status === 'Đã thuộc' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                 word.status === 'Cần luyện tập' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                 'bg-stone-50 text-stone-500 border-stone-200'
                               }`}
                             >
                               <option value="Chưa thuộc">Chưa thuộc</option>
                               <option value="Cần luyện tập">Luyện tập</option>
                               <option value="Đã thuộc">Đã thuộc</option>
                             </select>
                          </td>
                          <td className="px-6 py-5 text-center">
                             <button 
                               onClick={() => deleteWord(word.id, !!word.label)}
                               className="p-3 text-stone-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                               title="Xóa từ vựng"
                             >
                               <Trash2 size={18} />
                             </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-stone-50">
                  {words.map((word, idx) => (
                    <div key={word.id} className="bg-white rounded-2xl p-6 border border-stone-100 shadow-sm space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <span 
                            className="text-3xl cursor-pointer hover:scale-110 transition-transform" 
                            onClick={() => playAudio(word.word, language)}
                          >
                            {getWordIcon(word.word)}
                          </span>
                          <div>
                            <h4 className="text-xl font-bold text-stone-800">{word.word}</h4>
                            <p className="text-sm font-serif italic text-natural-primary">{word.pronunciation}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => playAudio(word.word, language)}
                          className="p-2 rounded-lg bg-natural-sidebar text-natural-primary hover:bg-natural-primary hover:text-white transition-colors"
                        >
                          <Volume2 size={16} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase font-bold text-stone-300">Nghĩa</p>
                          <p className="text-sm font-semibold text-stone-700">{word.meaning}</p>
                          <span className="text-[10px] bg-stone-100 px-1.5 rounded text-stone-400">{word.partOfSpeech}</span>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase font-bold text-stone-300">Trạng thái</p>
                          <select 
                             value={word.status || 'Chưa thuộc'}
                             onChange={(e) => updateWordStatus(word.id, e.target.value as any)}
                             className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border outline-none w-full ${
                               word.status === 'Đã thuộc' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                               word.status === 'Cần luyện tập' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                               'bg-stone-50 text-stone-500 border-stone-200'
                             }`}
                           >
                             <option value="Chưa thuộc">Chưa thuộc</option>
                             <option value="Cần luyện tập">Luyện tập</option>
                             <option value="Đã thuộc">Đã thuộc</option>
                           </select>
                        </div>
                      </div>

                      {word.caption && (
                        <div className="p-3 bg-natural-bg rounded-xl border border-dashed border-stone-200 text-xs italic text-stone-600">
                          “{word.caption}”
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2">
                         <div className="text-[10px] font-semibold text-stone-400 underline decoration-natural-accent underline-offset-4">
                           {word.grammar}
                         </div>
                         <button 
                           onClick={() => deleteWord(word.id, !!word.label)}
                           className="p-2 text-stone-400 hover:text-rose-500 transition-colors"
                         >
                           <Trash2 size={16} />
                         </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
                  </>
                )}
              </motion.div>
            ) : view === 'dashboard' ? (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                <div className="bg-white p-8 rounded-2xl border border-stone-100 shadow-sm col-span-full">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-2xl font-serif italic text-natural-primary mb-2">Chào mừng {userProfile?.displayName || 'bạn'} trở lại!</h3>
                      <p className="text-stone-500 text-sm italic">“Hôm nay là một ngày tuyệt vời để bắt đầu một thói quen tốt.” — TYANNA</p>
                    </div>
                    {user && (
                      <div className="flex gap-6">
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-stone-400 uppercase mb-1">Chuỗi học tập</p>
                          <div className="flex items-center gap-2 text-natural-primary">
                            <Trophy size={20} />
                            <span className="text-xl font-bold">{userProfile?.currentStreak || 0} ngày</span>
                          </div>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-stone-400 uppercase mb-1">Mục tiêu ngày</p>
                          <div className="flex items-center gap-2 text-natural-accent">
                            <Target size={20} />
                            <span className="text-xl font-bold">{todayLog?.wordsLearned.length || 0}/{userProfile?.dailyGoal || 5} từ</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Today's Mission */}
                <div className="col-span-full lg:col-span-1 bg-amber-50 p-8 rounded-2xl border border-amber-200">
                   <div className="flex items-center justify-between mb-4">
                      <h4 className="text-lg font-bold text-amber-900 flex items-center gap-2">
                        <RotateCcw size={20} /> QUICK REVIEW
                      </h4>
                      <History size={20} className="text-amber-400" />
                   </div>
                   <p className="text-sm text-amber-800 mb-6 font-serif">Ôn tập nhanh {Object.values(customWords).flat().filter(w => w.status === 'Cần luyện tập').length > 0 ? `có ${Object.values(customWords).flat().filter(w => w.status === 'Cần luyện tập').length} từ` : 'các từ vựng'} bạn đã đánh dấu 'Cần luyện tập' để ghi nhớ sâu hơn.</p>
                   <button 
                     onClick={handleQuickReview}
                     className="w-full py-3 bg-white text-amber-600 rounded-xl font-bold shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 border border-amber-100"
                   >
                     BẮT ĐẦU ÔN TẬP NGAY
                   </button>
                </div>

                <div className="col-span-full lg:col-span-2 bg-natural-sidebar p-8 rounded-2xl border border-stone-200">
                   <div className="flex items-center justify-between mb-6">
                      <h4 className="text-lg font-bold text-natural-primary flex items-center gap-2">
                        <Clock size={20} /> NHIỆM VỤ HÔM NAY (5x5 Logic)
                      </h4>
                      <span className="text-xs font-bold text-stone-400">{new Date().toLocaleDateString('vi-VN')}</span>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white p-6 rounded-xl border border-stone-100 shadow-sm">
                         <div className="flex items-center justify-between mb-4">
                            <span className="text-sm font-bold text-stone-700">Học từ mới</span>
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">+{todayLog?.wordsLearned.length || 0} vocabulary</span>
                         </div>
                         <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden">
                            <div 
                              className="bg-emerald-500 h-full transition-all duration-500" 
                              style={{ width: `${Math.min(100, ((todayLog?.wordsLearned.length || 0) / (userProfile?.dailyGoal || 5)) * 100)}%` }}
                            />
                         </div>
                         <p className="text-[10px] text-stone-400 mt-2 italic">Mục tiêu: Học ít nhất 5 từ mới mỗi ngày để duy trì thói quen.</p>
                      </div>

                      <div className="bg-white p-6 rounded-xl border border-stone-100 shadow-sm">
                         <div className="flex items-center justify-between mb-4">
                            <span className="text-sm font-bold text-stone-700">Kiểm tra bài cũ</span>
                            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{todayLog?.wordsReviewed.length || 0} reviewed</span>
                         </div>
                         <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden">
                            <div 
                              className="bg-amber-500 h-full transition-all duration-500" 
                              style={{ width: `${Math.min(100, ((todayLog?.wordsReviewed.length || 0) / (userProfile?.dailyGoal || 5)) * 100)}%` }}
                            />
                         </div>
                         <p className="text-[10px] text-stone-400 mt-2 italic">Mục tiêu: Ôn tập 5 từ đã học ngày hôm trước để không bị quên.</p>
                      </div>
                   </div>
                </div>

                <div className="bg-white p-8 rounded-2xl border border-stone-100 shadow-sm space-y-4 hover:shadow-md transition-shadow group flex flex-col justify-between">
                   <div>
                    <div className="w-12 h-12 rounded-xl bg-natural-sidebar flex items-center justify-center text-natural-primary group-hover:bg-natural-primary group-hover:text-white transition-colors mb-4">
                      <BookOpen size={24} />
                    </div>
                    <h4 className="text-lg font-bold text-stone-800">Lộ trình HSK</h4>
                    <p className="text-sm text-stone-500 leading-relaxed mb-4">Chinh phục 7 cấp độ Tiếng Trung tiêu chuẩn.</p>
                   </div>
                    <button 
                      onClick={() => { 
                        if (isPremiumLocked(undefined, 'Chinese', 'HSK 3')) {
                          setIsPremiumModalOpen(true);
                          setLockedItemInfo('HSK 3-7');
                        } else {
                          handleNavigate('vocabulary', 'HSK 1', 'Chinese', false); 
                        }
                      }}
                      className="w-full bg-natural-bg text-natural-primary py-3 rounded-xl text-sm font-bold border border-stone-100 hover:bg-natural-sidebar transition-colors"
                    >
                      Bắt đầu học HSK 1
                    </button>
                </div>

                <div className="bg-white p-8 rounded-2xl border border-stone-100 shadow-sm space-y-4 hover:shadow-md transition-shadow group flex flex-col justify-between">
                  <div>
                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors mb-4">
                      <GraduationCap size={24} />
                    </div>
                    <h4 className="text-lg font-bold text-stone-800">TOEIC Exam</h4>
                    <p className="text-sm text-stone-500 leading-relaxed mb-4">Tập trung vào giao tiếp công sở và kinh doanh.</p>
                  </div>
                  <button 
                     onClick={() => { 
                       if (isPremiumLocked(undefined, 'TOEIC', 'Part 5-6 (Grammar)')) {
                         setIsPremiumModalOpen(true);
                       } else {
                         handleNavigate('vocabulary', 'Part 5-6 (Grammar)', 'TOEIC', false); 
                       }
                     }}
                    className="w-full bg-blue-50 text-blue-600 py-3 rounded-xl text-sm font-bold hover:bg-blue-100 transition-colors"
                  >
                    Học TOEIC {!userProfile?.isPremium && '🔒'}
                  </button>
                </div>

                <div className="bg-white p-8 rounded-2xl border border-stone-100 shadow-sm space-y-4 hover:shadow-md transition-shadow group flex flex-col justify-between">
                  <div>
                    <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors mb-4">
                      <BrainCircuit size={24} />
                    </div>
                    <h4 className="text-lg font-bold text-stone-800">IELTS Prep</h4>
                    <p className="text-sm text-stone-500 leading-relaxed mb-4">Từ vựng học thuật cấp độ cao.</p>
                  </div>
                  <button 
                    onClick={() => { 
                      if (isPremiumLocked(undefined, 'IELTS', 'Band 6.0 (Transition)')) {
                        setIsPremiumModalOpen(true);
                      } else {
                        handleNavigate('vocabulary', 'Band 6.0 (Transition)', 'IELTS', false); 
                      }
                    }}
                    className="w-full bg-purple-50 text-purple-600 py-3 rounded-xl text-sm font-bold hover:bg-purple-100 transition-colors"
                  >
                    Luyện IELTS {!userProfile?.isPremium && '🔒'}
                  </button>
                </div>
              </motion.div>
            ) : view === 'practice_hub' ? (
              <motion.div 
                key="practice_hub"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-4xl mx-auto space-y-8 pb-12"
              >
                <div className="text-center space-y-2">
                   <h3 className="text-3xl font-serif italic text-natural-primary">Bạn muốn luyện tập phần nào?</h3>
                   <p className="text-stone-500">Chọn ngôn ngữ và lộ trình để bắt đầu bài kiểm tra AI</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   <div 
                     onClick={() => { setLanguage('Chinese'); setLevel('HSK 1'); }}
                     className={`p-6 rounded-2xl border-2 cursor-pointer transition-all relative ${language === 'Chinese' ? 'border-natural-primary bg-natural-sidebar shadow-md' : 'border-stone-100 bg-white hover:border-natural-sidebar'}`}
                   >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${language === 'Chinese' ? 'bg-natural-primary text-white' : 'bg-stone-50 text-stone-400'}`}>
                         <span className="font-bold">中</span>
                      </div>
                      <h4 className="font-bold text-stone-800">Tiếng Trung</h4>
                      {!userProfile?.isPremium && <span className="absolute top-4 right-4 text-[10px]">HSK 1-2 Free 🔒 3-7</span>}
                      <p className="text-xs text-stone-500 mt-1">Lộ trình HSK 1-7 chuẩn quốc tế.</p>
                   </div>

                   <div 
                     onClick={() => { setLanguage('TOEIC'); setLevel('Part 1-4 (Listening)'); }}
                     className={`p-6 rounded-2xl border-2 cursor-pointer transition-all relative ${language === 'TOEIC' ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-stone-100 bg-white hover:border-blue-50'}`}
                   >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${language === 'TOEIC' ? 'bg-blue-500 text-white' : 'bg-stone-50 text-stone-400'}`}>
                         <span className="font-bold">T</span>
                      </div>
                      <h4 className="font-bold text-stone-800">TOEIC Exam</h4>
                      {!userProfile?.isPremium && <span className="absolute top-4 right-4 text-[10px]">Part 1-4 Free 🔒</span>}
                      <p className="text-xs text-stone-500 mt-1">Tiếng Anh công sở & doanh nghiệp.</p>
                   </div>

                   <div 
                     onClick={() => { setLanguage('IELTS'); setLevel('Band 6.0 (Transition)'); }}
                     className={`p-6 rounded-2xl border-2 cursor-pointer transition-all ${language === 'IELTS' ? 'border-purple-500 bg-purple-50 shadow-md' : 'border-stone-100 bg-white hover:border-purple-50'}`}
                   >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${language === 'IELTS' ? 'bg-purple-500 text-white' : 'bg-stone-50 text-stone-400'}`}>
                         <span className="font-bold">I</span>
                      </div>
                      <h4 className="font-bold text-stone-800">IELTS Prep</h4>
                      <p className="text-xs text-stone-500 mt-1">Học thuật & nghiên cứu nâng cao.</p>
                   </div>
                </div>

                <div className="bg-white p-8 rounded-3xl border border-stone-100 shadow-xl space-y-6">
                   <div className="flex items-center gap-4 p-2 bg-stone-50 rounded-2xl">
                      {(['translation', 'ordering', 'listening', 'flashcards'] as const).map((type) => (
                        <button
                          key={type}
                          onClick={() => setSelectedPracticeType(type)}
                          className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold capitalize transition-all ${selectedPracticeType === type ? 'bg-white text-natural-primary shadow-md' : 'text-stone-400 hover:text-stone-600'}`}
                        >
                          {type === 'translation' ? 'Viết câu' : type === 'ordering' ? 'Sắp xếp' : type === 'listening' ? 'Nghe' : 'Thẻ học'}
                        </button>
                      ))}
                   </div>

                   <div className="space-y-4">
                      <div className="flex items-center justify-between px-2">
                         <span className="text-sm font-bold text-stone-400 uppercase tracking-widest">Cấp độ hiện tại</span>
                         <span className="text-sm font-bold text-natural-primary">{level}</span>
                      </div>
                      <button 
                         onClick={() => handleStartTest(selectedPracticeType)}
                         className="w-full py-4 bg-natural-primary text-white rounded-2xl font-bold shadow-xl shadow-natural-primary/20 hover:bg-natural-accent transition-all flex items-center justify-center gap-2"
                      >
                         <BrainCircuit size={20} />
                         BẮT ĐẦU LUYỆN TẬP NGAY
                      </button>
                   </div>
                </div>
              </motion.div>
            ) : view === 'fluency' ? (
              <motion.div 
                key="fluency"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-3xl mx-auto space-y-8 pb-12"
              >
                <div className="bg-white p-8 rounded-3xl border border-stone-100 shadow-xl space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-serif italic text-natural-primary">Luyện nói trôi chảy</h3>
                    <div className="flex items-center gap-2 px-3 py-1 bg-natural-sidebar rounded-full text-natural-primary text-xs font-bold">
                       <Mic size={14} /> {language} - {level}
                    </div>
                  </div>
                  
                  {isFluencyLoading && !currentFluencySituation ? (
                    <div className="py-20 text-center space-y-4">
                      <div className="w-12 h-12 border-4 border-natural-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
                      <p className="text-stone-500 animate-pulse">AI đang tạo tình huống hội thoại cho bạn...</p>
                    </div>
                  ) : currentFluencySituation && (
                    <div className="space-y-6">
                      <div className="bg-stone-50 p-6 rounded-2xl border border-stone-100 space-y-4">
                        <div className="flex items-center gap-2 text-stone-400">
                          <MessageSquare size={16} />
                          <span className="text-[10px] font-bold uppercase tracking-widest">Tình huống</span>
                        </div>
                        <h4 className="text-xl font-bold text-stone-800">{currentFluencySituation.scenario}</h4>
                        <p className="text-stone-600 leading-relaxed italic">"{currentFluencySituation.instruction}"</p>
                        <div className="pt-4 border-t border-stone-200">
                           <span className="text-[10px] font-bold text-stone-400 uppercase block mb-1">Bối cảnh ({language})</span>
                           <p className="text-natural-primary font-medium">{currentFluencySituation.context}</p>
                        </div>
                      </div>

                      {!fluencyEvaluation ? (
                        <div className="space-y-4">
                          <div className="space-y-1">
                             <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Câu trả lời của bạn</label>
                             <textarea 
                               value={userFluencyResponse}
                               onChange={e => setUserFluencyResponse(e.target.value)}
                               placeholder={`Nhập câu trả lời bằng ${language}...`}
                               className="w-full p-4 bg-white border-2 border-stone-100 rounded-2xl focus:border-natural-primary outline-none min-h-[120px] transition-all"
                             />
                          </div>
                          <button 
                            disabled={isFluencyLoading || !userFluencyResponse.trim()}
                            onClick={handleSubmitFluency}
                            className="w-full py-4 bg-natural-primary text-white rounded-2xl font-bold shadow-xl shadow-natural-primary/20 hover:bg-natural-accent disabled:bg-stone-200 disabled:shadow-none transition-all flex items-center justify-center gap-2"
                          >
                            {isFluencyLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Target size={20} />}
                            GỬI CÂU TRẢ LỜI & NHẬN PHẢN HỒI
                          </button>
                        </div>
                      ) : (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="space-y-6"
                        >
                          <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 space-y-4">
                             <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Feedback từ AI</span>
                                {fluencyEvaluation.isNatural && <span className="text-[10px] px-2 py-0.5 bg-emerald-500 text-white rounded-full">✨ Rất tự nhiên</span>}
                             </div>
                             <p className="text-emerald-900 leading-relaxed">{fluencyEvaluation.feedback}</p>
                          </div>

                          <div className="bg-natural-sidebar p-6 rounded-2xl border border-stone-100 space-y-2">
                             <span className="text-[10px] font-bold text-natural-primary uppercase tracking-widest">Suggested Version (Xịn hơn)</span>
                             <p className="text-xl font-bold text-stone-800">{fluencyEvaluation.suggestedVersion}</p>
                             <button 
                               onClick={() => playAudio(fluencyEvaluation.suggestedVersion, language)}
                               className="flex items-center gap-2 text-natural-primary hover:text-natural-accent transition-colors text-sm font-bold mt-2"
                             >
                               <Volume2 size={16} /> Nghe phát âm mẫu
                             </button>
                          </div>

                          <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 flex items-center gap-4">
                             <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center text-white shadow-lg">
                                <Trophy size={24} />
                             </div>
                             <div>
                                <h4 className="font-bold text-amber-900">Tuyệt vời, {userProfile?.displayName || 'Tyanna'}!</h4>
                                <p className="text-sm text-amber-700">Bạn đã hoàn thành bài tập và nhận được +5 Chuỗi lửa 🔥.</p>
                             </div>
                          </div>

                          <button 
                            onClick={handleStartFluency}
                            className="w-full py-4 bg-stone-800 text-white rounded-2xl font-bold hover:bg-black transition-all"
                          >
                            TIẾP TỤC LUYỆN TẬP TÌNH HUỐNG MỚI
                          </button>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Footer Status Bar */}
        <footer className="bg-stone-50 px-8 py-3 border-t border-stone-100 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Online Session
            </span>
            <span className="text-[10px] text-stone-400 uppercase tracking-widest">Last Sync: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div className="text-[10px] text-stone-400 italic font-serif">
            “The roots of education are bitter, but the fruit is sweet.” — Tyanna
          </div>
        </footer>
      </main>
      {/* Penalty Message Modal */}
      <AnimatePresence>
        {penaltyMessage && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setPenaltyMessage(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 border-b-4 border-rose-500"
            >
               <div className="flex items-center gap-4 mb-4">
                 <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center">
                   <XCircle size={24} />
                 </div>
                 <h4 className="font-bold text-stone-800">Cần chú ý!</h4>
               </div>
               <p className="text-stone-600 mb-6 leading-relaxed">
                 {penaltyMessage}
               </p>
               <button 
                 onClick={() => setPenaltyMessage(null)}
                 className="w-full py-3 bg-stone-800 text-white rounded-xl font-bold hover:bg-black transition-all"
               >
                 ĐÃ HIỂU, HỌC NGAY!
               </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Premium Paywall Modal */}
      <AnimatePresence>
        {isPremiumModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPremiumModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-[340px] bg-white rounded-3xl shadow-2xl overflow-hidden text-center p-6 border border-stone-100"
            >
              <h3 className="text-xl font-bold text-[#6a704c] mb-1">
                🔒 Gói Premium Smartlingua
              </h3>
              <p className="text-[10px] text-[#999] mb-5 font-medium uppercase tracking-wider">
                Nâng cấp cùng Tyanna để mở khóa HSK 3-7
              </p>
              
              <div className="flex justify-center gap-1.5 mb-5">
                {[
                  { price: '29k', duration: '2 THÁNG', id: 'price29' },
                  { price: '49k', duration: '4 THÁNG', id: 'price49' },
                  { price: '69k', duration: '6 THÁNG', id: 'price69', isBest: true }
                ].map((plan) => (
                  <button 
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan)}
                    className={`flex-1 p-2 py-3 rounded-xl border transition-all text-center relative ${
                      selectedPlan.id === plan.id 
                        ? 'border-2 border-[#6a704c] bg-[#f9faf5]' 
                        : 'border-stone-100 bg-[#fafafa] hover:border-stone-200'
                    }`}
                  >
                    {plan.isBest && (
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-[#6a704c] text-white text-[7px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-tighter whitespace-nowrap">BEST VALUE</div>
                    )}
                    <b className={`block text-[13px] leading-tight mb-0.5 ${selectedPlan.id === plan.id ? 'text-[#6a704c]' : 'text-stone-800'}`}>{plan.price}</b>
                    <small className={`text-[8px] font-bold tracking-widest leading-none ${selectedPlan.id === plan.id ? 'text-[#6a704c]' : 'text-[#999]'}`}>{plan.duration}</small>
                  </button>
                ))}
              </div>

              <div className="bg-[#fdfcf8] p-4 rounded-2xl border border-dashed border-[#ddd] mb-4 text-center">
                 <div className="flex justify-center mb-3">
                   <img 
                     src={qrImages[selectedPlan.id]} 
                     alt="QR Tyanna" 
                     className="w-44 h-44 rounded-xl shadow-lg border border-stone-100 bg-white p-1"
                     referrerPolicy="no-referrer"
                   />
                 </div>
                 <div className="bg-white p-2 rounded-lg border border-stone-100 shadow-sm">
                    <p className="text-[8px] text-[#aaa] font-bold uppercase tracking-widest mb-0.5">Nội dung chuyển khoản</p>
                    <b className="text-[11px] text-[#ff6b81] italic">Đóng phí xinh iu Smartlingua</b>
                 </div>
              </div>

              {paymentStatus ? (
                <div className="mb-4 p-3 rounded-xl bg-[#f9f9f9] border-l-3" style={{ borderLeftColor: paymentStatus.color }}>
                  <p className="text-[10px] font-bold text-center" style={{ color: paymentStatus.color }}>
                    {paymentStatus.text}
                  </p>
                </div>
              ) : (
                <div className="mb-4 p-3 rounded-xl bg-stone-50 border border-stone-100 text-center">
                  <p className="text-[10px] text-stone-400 font-medium italic">Chưa nâng cấp Premium ✨</p>
                </div>
              )}

              <div className="space-y-3 pt-1">
                <button 
                  onClick={handleConfirmPayment}
                  disabled={!!paymentStatus}
                  className={`w-full py-4 rounded-full font-bold shadow-xl transition-all flex items-center justify-center gap-2 text-sm ${paymentStatus ? 'bg-stone-300 text-stone-500 cursor-not-allowed shadow-none' : 'bg-[#5d6343] text-white shadow-[#5d6343]/20 hover:bg-[#4a4f35] hover:scale-[1.03]'}`}
                >
                  {paymentStatus ? 'Đang xử lý...' : '🏆 Xác nhận & Mở khóa ngay! 💖'}
                </button>
                
                <button 
                  onClick={() => setIsPremiumModalOpen(false)}
                  className="text-[11px] font-bold text-stone-300 hover:text-stone-400 transition-colors uppercase tracking-[0.2em]"
                >
                  Để sau nhé
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal for adding personal word */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-800">Thêm từ vựng mới</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <XCircle size={24} />
                </button>
              </div>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase">Từ vựng</label>
                    <input 
                      type="text" 
                      value={newWord.word} 
                      onChange={e => setNewWord({...newWord, word: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. 学习"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase">Phiên âm</label>
                    <input 
                      type="text" 
                      value={newWord.pronunciation} 
                      onChange={e => setNewWord({...newWord, pronunciation: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. xuéxí"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase">Nghĩa & Loại từ</label>
                  <div className="flex gap-2">
                    <select 
                      value={newWord.partOfSpeech}
                      onChange={e => setNewWord({...newWord, partOfSpeech: e.target.value})}
                      className="px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="noun">Danh từ</option>
                      <option value="verb">Động từ</option>
                      <option value="adj">Tính từ</option>
                      <option value="adv">Trạng từ</option>
                    </select>
                    <input 
                      type="text" 
                      value={newWord.meaning} 
                      onChange={e => setNewWord({...newWord, meaning: e.target.value})}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. Học tập"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Phân loại (Label)</label>
                      <select 
                        onChange={e => setNewWord({...newWord, label: e.target.value as any})}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                         <option value="Daily">Daily</option>
                         <option value="Marketing">Marketing</option>
                         <option value="Work">Work</option>
                      </select>
                   </div>
                   <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Caption mẫu</label>
                      <input 
                        type="text" 
                        onChange={e => setNewWord({...newWord, caption: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Caption cho portfolio/shop..."
                      />
                   </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase">Ngữ pháp / Ghi chú</label>
                  <textarea 
                    value={newWord.grammar} 
                    onChange={e => setNewWord({...newWord, grammar: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 h-20"
                    placeholder="e.g. Dùng với '常', '好好'..."
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-bold text-gray-400 uppercase">Ví dụ thực tế</label>
                  {newWord.examples.map((ex, i) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-lg space-y-2">
                      <input 
                        type="text" 
                        value={ex.target} 
                        onChange={e => {
                          const exs = [...newWord.examples];
                          exs[i].target = e.target.value;
                          setNewWord({...newWord, examples: exs});
                        }}
                        className="w-full px-2 py-1 text-sm border-b border-gray-200 bg-transparent outline-none"
                        placeholder={`Câu ví dụ ${i+1}`}
                      />
                      <input 
                        type="text" 
                        value={ex.vietnamese} 
                        onChange={e => {
                          const exs = [...newWord.examples];
                          exs[i].vietnamese = e.target.value;
                          setNewWord({...newWord, examples: exs});
                        }}
                        className="w-full px-2 py-1 text-xs text-gray-500 bg-transparent outline-none"
                        placeholder="Nghĩa Tiếng Việt"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-6 bg-stone-50 border-t border-stone-100 flex gap-3">
                 <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 text-sm font-bold text-stone-400 hover:text-stone-600 transition-colors">Hủy</button>
                 <button onClick={addPersonalWord} className="flex-[2] py-3 bg-natural-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-natural-primary/20 hover:bg-natural-accent transition-all">Lưu từ vựng</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
