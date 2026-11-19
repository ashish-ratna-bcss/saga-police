import { useSyncExternalStore } from 'react';

/** Keyboard languages + keyword suggestions for search bars. */

const split = (s) => s.split(/\s+/).filter(Boolean);
function split2(s) { return s.split('|'); }

export const KEYBOARD_LANGUAGES = [
  {
    code: 'en',
    label: 'English',
    native: 'English',
    sample: 'Search',
    rows: [
      { title: 'Letters', keys: split('a b c d e f g h i j k l m n o p q r s t u v w x y z') },
      { title: 'Digits', keys: split('0 1 2 3 4 5 6 7 8 9') },
    ],
  },
  {
    code: 'te',
    label: 'Telugu',
    native: 'తెలుగు',
    sample: 'వెతకండి',
    rows: [
      { title: 'Vowels', keys: split('అ ఆ ఇ ఈ ఉ ఊ ఋ ఎ ఏ ఐ ఒ ఓ ఔ ం ః') },
      { title: 'Vowel signs', keys: split('ా ి ీ ు ూ ృ ె ే ై ొ ో ౌ ్'), sign: true },
      { title: 'Consonants', keys: split('క ఖ గ ఘ ఙ చ ఛ జ ఝ ఞ ట ఠ డ ఢ ణ త థ ద ధ న ప ఫ బ భ మ య ర ల వ శ ష స హ ళ ఱ') },
      { title: 'Digits', keys: split('౦ ౧ ౨ ౩ ౪ ౫ ౬ ౭ ౮ ౯') },
    ],
  },
  {
    code: 'hi',
    label: 'Hindi',
    native: 'हिन्दी',
    sample: 'खोजें',
    rows: [
      { title: 'Vowels', keys: split('अ आ इ ई उ ऊ ऋ ए ऐ ओ औ अं अः') },
      { title: 'Vowel signs', keys: split('ा ि ी ु ू ृ े ै ो ौ ं ः ् ँ'), sign: true },
      { title: 'Consonants', keys: split('क ख ग घ ङ च छ ज झ ञ ट ठ ड ढ ण त थ द ध न प फ ब भ म य र ल व श ष स ह') },
      { title: 'Digits', keys: split('० १ २ ३ ४ ५ ६ ७ ८ ९') },
    ],
  },
  {
    code: 'ta',
    label: 'Tamil',
    native: 'தமிழ்',
    sample: 'தேடு',
    rows: [
      { title: 'Vowels', keys: split('அ ஆ இ ஈ உ ஊ எ ஏ ஐ ஒ ஓ ஔ ஃ') },
      { title: 'Vowel signs', keys: split('ா ி ீ ு ூ ெ ே ை ொ ோ ௌ ்'), sign: true },
      { title: 'Consonants', keys: split('க ங ச ஞ ட ண த ந ப ம ய ர ல வ ழ ள ற ன ஜ ஷ ஸ ஹ') },
      { title: 'Digits', keys: split('௦ ௧ ௨ ௩ ௪ ௫ ௬ ௭ ௮ ௯') },
    ],
  },
  {
    code: 'kn',
    label: 'Kannada',
    native: 'ಕನ್ನಡ',
    sample: 'ಹುಡುಕಿ',
    rows: [
      { title: 'Vowels', keys: split('ಅ ಆ ಇ ಈ ಉ ಊ ಋ ಎ ಏ ಐ ಒ ಓ ಔ ಂ ಃ') },
      { title: 'Vowel signs', keys: split('ಾ ಿ ೀ ು ೂ ೃ ೆ ೇ ೈ ೊ ೋ ೌ ್'), sign: true },
      { title: 'Consonants', keys: split('ಕ ಖ ಗ ಘ ಙ ಚ ಛ ಜ ಝ ಞ ಟ ಠ ಡ ಢ ಣ ತ ಥ ದ ಧ ನ ಪ ಫ ಬ ಭ ಮ ಯ ರ ಲ ವ ಶ ಷ ಸ ಹ ಳ') },
      { title: 'Digits', keys: split('೦ ೧ ೨ ೩ ೪ ೫ ೬ ೭ ೮ ೯') },
    ],
  },
  {
    code: 'ml',
    label: 'Malayalam',
    native: 'മലയാളം',
    sample: 'തിരയുക',
    rows: [
      { title: 'Vowels', keys: split('അ ആ ഇ ഈ ഉ ഊ ഋ എ ഏ ഐ ഒ ഓ ഔ ം ഃ') },
      { title: 'Vowel signs', keys: split('ാ ി ീ ു ൂ ൃ െ േ ൈ ൊ ോ ൌ ്'), sign: true },
      { title: 'Consonants', keys: split('ക ഖ ഗ ഘ ങ ച ഛ ജ ഝ ഞ ട ഠ ഡ ഢ ണ ത ഥ ദ ധ ന പ ഫ ബ ഭ മ യ ര ല വ ശ ഷ സ ഹ ള ഴ റ') },
      { title: 'Digits', keys: split('൦ ൧ ൨ ൩ ൪ ൫ ൬ ൭ ൮ ൯') },
    ],
  },
  ...[
    ['es', 'Spanish', 'Español', 'Buscar', 'ñ á é í ó ú ü ¿ ¡'],
    ['fr', 'French', 'Français', 'Rechercher', 'à â æ ç é è ê ë î ï ô œ ù û ü ÿ'],
    ['de', 'German', 'Deutsch', 'Suchen', 'ä ö ü ß'],
    ['pt', 'Portuguese', 'Português', 'Pesquisar', 'ã õ á â à ç é ê í ó ô ú'],
    ['it', 'Italian', 'Italiano', 'Cerca', 'à è é ì í î ò ó ù ú'],
    ['tr', 'Turkish', 'Türkçe', 'Ara', 'ç ğ ı İ ö ş ü'],
  ].map(([code, label, native, sample, accents]) => ({
    code, label, native, sample,
    rows: [
      { title: 'Letters', keys: split('a b c d e f g h i j k l m n o p q r s t u v w x y z') },
      { title: 'Accents', keys: split(accents) },
      { title: 'Digits', keys: split('0 1 2 3 4 5 6 7 8 9') },
    ],
  })),
  {
    code: 'ru', label: 'Russian', native: 'Русский', sample: 'Поиск',
    rows: [
      { title: 'Letters', keys: split('а б в г д е ё ж з и й к л м н о п р с т у ф х ц ч ш щ ъ ы ь э ю я') },
      { title: 'Digits', keys: split('0 1 2 3 4 5 6 7 8 9') },
    ],
  },
  {
    code: 'el', label: 'Greek', native: 'Ελληνικά', sample: 'Αναζήτηση',
    rows: [
      { title: 'Letters', keys: split('α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ ς τ υ φ χ ψ ω') },
      { title: 'Accents', keys: split('ά έ ή ί ό ύ ώ ϊ ϋ') },
      { title: 'Digits', keys: split('0 1 2 3 4 5 6 7 8 9') },
    ],
  },
  {
    code: 'ar', label: 'Arabic', native: 'العربية', sample: 'بحث', rtl: true,
    rows: [
      { title: 'Letters', keys: split('ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي ء أ إ آ ؤ ئ ة ى') },
      { title: 'Marks', keys: split('َ ُ ِ ً ٌ ٍ ّ ْ'), sign: true },
      { title: 'Digits', keys: split('٠ ١ ٢ ٣ ٤ ٥ ٦ ٧ ٨ ٩') },
    ],
  },
  {
    code: 'ur', label: 'Urdu', native: 'اردو', sample: 'تلاش', rtl: true,
    rows: [
      { title: 'Letters', keys: split('ا ب پ ت ٹ ث ج چ ح خ د ڈ ذ ر ڑ ز ژ س ش ص ض ط ظ ع غ ف ق ک گ ل م ن ں و ہ ھ ء ی ے') },
      { title: 'Marks', keys: split('َ ُ ِ ً ٌ ٍ ّ ْ'), sign: true },
      { title: 'Digits', keys: split('۰ ۱ ۲ ۳ ۴ ۵ ۶ ۷ ۸ ۹') },
    ],
  },
  {
    code: 'fa', label: 'Persian', native: 'فارسی', sample: 'جستجو', rtl: true,
    rows: [
      { title: 'Letters', keys: split('ا ب پ ت ث ج چ ح خ د ذ ر ز ژ س ش ص ض ط ظ ع غ ف ق ک گ ل م ن و ه ی ء آ') },
      { title: 'Digits', keys: split('۰ ۱ ۲ ۳ ۴ ۵ ۶ ۷ ۸ ۹') },
    ],
  },
  {
    code: 'he', label: 'Hebrew', native: 'עברית', sample: 'חיפוש', rtl: true,
    rows: [
      { title: 'Letters', keys: split('א ב ג ד ה ו ז ח ט י כ ך ל מ ם נ ן ס ע פ ף צ ץ ק ר ש ת') },
      { title: 'Digits', keys: split('0 1 2 3 4 5 6 7 8 9') },
    ],
  },
  {
    code: 'bn', label: 'Bengali', native: 'বাংলা', sample: 'অনুসন্ধান',
    rows: [
      { title: 'Vowels', keys: split('অ আ ই ঈ উ ঊ ঋ এ ঐ ও ঔ ং ঃ ঁ') },
      { title: 'Vowel signs', keys: split('া ি ী ু ূ ৃ ে ৈ ো ৌ ্'), sign: true },
      { title: 'Consonants', keys: split('ক খ গ ঘ ঙ চ ছ জ ঝ ঞ ট ঠ ড ঢ ণ ত থ দ ধ ন প ফ ব ভ ম য র ল শ ষ স হ ড় ঢ় য় ৎ') },
      { title: 'Digits', keys: split('০ ১ ২ ৩ ৪ ৫ ৬ ৭ ৮ ৯') },
    ],
  },
  {
    code: 'gu', label: 'Gujarati', native: 'ગુજરાતી', sample: 'શોધો',
    rows: [
      { title: 'Vowels', keys: split('અ આ ઇ ઈ ઉ ઊ ઋ એ ઐ ઓ ઔ ં ઃ') },
      { title: 'Vowel signs', keys: split('ા િ ી ુ ૂ ૃ ે ૈ ો ૌ ્'), sign: true },
      { title: 'Consonants', keys: split('ક ખ ગ ઘ ઙ ચ છ જ ઝ ઞ ટ ઠ ડ ઢ ણ ત થ દ ધ ન પ ફ બ ભ મ ય ર લ વ શ ષ સ હ ળ') },
      { title: 'Digits', keys: split('૦ ૧ ૨ ૩ ૪ ૫ ૬ ૭ ૮ ૯') },
    ],
  },
  {
    code: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ', sample: 'ਖੋਜੋ',
    rows: [
      { title: 'Vowels', keys: split('ਅ ਆ ਇ ਈ ਉ ਊ ਏ ਐ ਓ ਔ ੳ ੲ') },
      { title: 'Vowel signs', keys: split('ਾ ਿ ੀ ੁ ੂ ੇ ੈ ੋ ੌ ੰ ਂ ੍'), sign: true },
      { title: 'Consonants', keys: split('ਸ ਹ ਕ ਖ ਗ ਘ ਙ ਚ ਛ ਜ ਝ ਞ ਟ ਠ ਡ ਢ ਣ ਤ ਥ ਦ ਧ ਨ ਪ ਫ ਬ ਭ ਮ ਯ ਰ ਲ ਵ ੜ') },
      { title: 'Digits', keys: split('੦ ੧ ੨ ੩ ੪ ੫ ੬ ੭ ੮ ੯') },
    ],
  },
  {
    code: 'or', label: 'Odia', native: 'ଓଡ଼ିଆ', sample: 'ଖୋଜନ୍ତୁ',
    rows: [
      { title: 'Vowels', keys: split('ଅ ଆ ଇ ଈ ଉ ଊ ଋ ଏ ଐ ଓ ଔ ଂ ଃ') },
      { title: 'Vowel signs', keys: split('ା ି ୀ ୁ ୂ ୃ େ ୈ ୋ ୌ ୍'), sign: true },
      { title: 'Consonants', keys: split('କ ଖ ଗ ଘ ଙ ଚ ଛ ଜ ଝ ଞ ଟ ଠ ଡ ଢ ଣ ତ ଥ ଦ ଧ ନ ପ ଫ ବ ଭ ମ ଯ ର ଲ ଳ ଵ ଶ ଷ ସ ହ') },
      { title: 'Digits', keys: split('୦ ୧ ୨ ୩ ୪ ୫ ୬ ୭ ୮ ୯') },
    ],
  },
  ...[
    ['mr', 'Marathi', 'मराठी', 'शोधा', ' ळ'],
    ['ne', 'Nepali', 'नेपाली', 'खोज्नुहोस्', ''],
  ].map(([code, label, native, sample, extraCons]) => ({
    code, label, native, sample,
    rows: [
      { title: 'Vowels', keys: split('अ आ इ ई उ ऊ ऋ ए ऐ ओ औ अं अः') },
      { title: 'Vowel signs', keys: split('ा ि ी ु ू ृ े ै ो ौ ं ः ् ँ'), sign: true },
      { title: 'Consonants', keys: split('क ख ग घ ङ च छ ज झ ञ ट ठ ड ढ ण त थ द ध न प फ ब भ म य र ल व श ष स ह' + extraCons) },
      { title: 'Digits', keys: split('० १ २ ३ ४ ५ ६ ७ ८ ९') },
    ],
  })),
  {
    code: 'si', label: 'Sinhala', native: 'සිංහල', sample: 'සොයන්න',
    rows: [
      { title: 'Vowels', keys: split('අ ආ ඇ ඈ ඉ ඊ උ ඌ එ ඒ ඓ ඔ ඕ ඖ ං ඃ') },
      { title: 'Vowel signs', keys: split('ා ැ ෑ ි ී ු ූ ෙ ේ ෛ ො ෝ ෞ ්'), sign: true },
      { title: 'Consonants', keys: split('ක ඛ ග ඝ ඞ ච ඡ ජ ඣ ඤ ට ඨ ඩ ඪ ණ ත ථ ද ධ න ප ඵ බ භ ම ය ර ල ව ශ ෂ ස හ ළ ෆ') },
    ],
  },
  {
    code: 'th', label: 'Thai', native: 'ไทย', sample: 'ค้นหา',
    rows: [
      { title: 'Consonants', keys: split('ก ข ฃ ค ฅ ฆ ง จ ฉ ช ซ ฌ ญ ฎ ฏ ฐ ฑ ฒ ณ ด ต ถ ท ธ น บ ป ผ ฝ พ ฟ ภ ม ย ร ล ว ศ ษ ส ห ฬ อ ฮ') },
      { title: 'Vowels', keys: split('ะ า ำ เ แ โ ใ ไ ๅ') },
      { title: 'Marks', keys: split('ั ิ ี ึ ื ุ ู ็ ่ ้ ๊ ๋ ์'), sign: true },
      { title: 'Digits', keys: split('๐ ๑ ๒ ๓ ๔ ๕ ๖ ๗ ๘ ๙') },
    ],
  },
  {
    code: 'ko', label: 'Korean', native: '한국어', sample: '검색',
    rows: [
      { title: 'Consonants', keys: split('ㄱ ㄲ ㄴ ㄷ ㄸ ㄹ ㅁ ㅂ ㅃ ㅅ ㅆ ㅇ ㅈ ㅉ ㅊ ㅋ ㅌ ㅍ ㅎ') },
      { title: 'Vowels', keys: split('ㅏ ㅐ ㅑ ㅒ ㅓ ㅔ ㅕ ㅖ ㅗ ㅘ ㅙ ㅚ ㅛ ㅜ ㅝ ㅞ ㅟ ㅠ ㅡ ㅢ ㅣ') },
      { title: 'Digits', keys: split('0 1 2 3 4 5 6 7 8 9') },
    ],
  },
  {
    code: 'zh', label: 'Chinese', native: '中文', sample: '搜索',
    rows: [
      { title: 'Numbers', keys: split('一 二 三 四 五 六 七 八 九 十 百 千 万') },
      { title: 'Government & law', keys: split('政 府 警 察 法 案 选 举 民 公 国 部 局 会 议 院 校 医') },
      { title: 'Society', keys: split('人 女 儿 学 生 家 村 农 工 业 价 格 钱 路 水 电 火 雨 灾 事 故 新 闻') },
      { title: 'Common', keys: split('的 一 是 不 了 我 在 有 他 这 中 大 来 上 个 到 说 们 为 子 和 你 地 出 也 时 年 就 那 要 下 以 会 自 着 去 之 过 对 可 她 里 后 小 么 心 多 天 而 能 好 都 然 没 日 于 起 还 发 成 只 作 当 想 看 文 无 开 手 用 主 行 方 又 如 前 所 本 见 经 头 面 同 已 老 从 动 两 长 知 样 现 分 将 外 但 身 些 与 高 意 进 把 此 实 回 理 美 点 月 明 其 种 声 全 己 话 者 向 情 正 名 定 问 力 机 给 等 几 很 最 间 什 打 便 位 因 重 被 走 第 门 相 次 东 海 口 使 教 西 再 平 真 听 世 气 信 北 少 关 并 内 比 或 特 命 山') },
    ],
  },
  {
    code: 'ja', label: 'Japanese (kana)', native: '日本語', sample: '検索',
    rows: [
      { title: 'Hiragana', keys: split('あ い う え お か き く け こ さ し す せ そ た ち つ て と な に ぬ ね の は ひ ふ へ ほ ま み む め も や ゆ よ ら り る れ ろ わ を ん') },
      { title: 'Katakana', keys: split('ア イ ウ エ オ カ キ ク ケ コ サ シ ス セ ソ タ チ ツ テ ト ナ ニ ヌ ネ ノ ハ ヒ フ ヘ ホ マ ミ ム メ モ ヤ ユ ヨ ラ リ ル レ ロ ワ ヲ ン ー') },
      { title: 'Marks', keys: split('゛ ゜'), sign: true },
    ],
  },
];

/** [English, te, hi, ta, kn, ml] — common monitoring / civic keywords. */
const KEYWORD_TABLE = [
  ['police', 'పోలీస్', 'पुलिस', 'காவல்துறை', 'ಪೊಲೀಸ್', 'പോലീസ്'],
  ['arrest', 'అరెస్టు', 'गिरफ्तारी', 'கைது', 'ಬಂಧನ', 'അറസ്റ്റ്'],
  ['protest', 'నిరసన', 'विरोध प्रदर्शन', 'போராட்டம்', 'ಪ್ರತಿಭಟನೆ', 'പ്രതിഷേധം'],
  ['rally', 'ర్యాలీ', 'रैली', 'பேரணி', 'ರ್ಯಾಲಿ', 'റാലി'],
  ['meeting', 'సమావేశం', 'बैठक', 'கூட்டம்', 'ಸಭೆ', 'യോഗം'],
  ['complaint', 'ఫిర్యాదు', 'शिकायत', 'புகார்', 'ದೂರು', 'പരാതി'],
  ['road', 'రోడ్డు', 'सड़क', 'சாலை', 'ರಸ್ತೆ', 'റോഡ്'],
  ['water', 'నీరు', 'पानी', 'தண்ணீர்', 'ನೀರು', 'വെള്ളം'],
  ['electricity', 'విద్యుత్', 'बिजली', 'மின்சாரம்', 'ವಿದ್ಯುತ್', 'വൈദ്യുതി'],
  ['hospital', 'ఆసుపత్రి', 'अस्पताल', 'மருத்துவமனை', 'ಆಸ್ಪತ್ರೆ', 'ആശുപത്രി'],
  ['school', 'పాఠశాల', 'स्कूल', 'பள்ளி', 'ಶಾಲೆ', 'സ്കൂൾ'],
  ['farmer', 'రైతు', 'किसान', 'விவசாயி', 'ರೈತ', 'കർഷകൻ'],
  ['rain', 'వర్షం', 'बारिश', 'மழை', 'ಮಳೆ', 'മഴ'],
  ['flood', 'వరద', 'बाढ़', 'வெள்ளம்', 'ಪ್ರವಾಹ', 'വെള്ളപ്പൊക്കം'],
  ['fire accident', 'అగ్ని ప్రమాదం', 'आग', 'தீ விபத்து', 'ಬೆಂಕಿ ಅವಘಡ', 'തീപിടുത്തം'],
  ['accident', 'ప్రమాదం', 'दुर्घटना', 'விபத்து', 'ಅಪಘಾತ', 'അപകടം'],
  ['murder', 'హత్య', 'हत्या', 'கொலை', 'ಕೊಲೆ', 'കൊലപാതകം'],
  ['theft', 'దొంగతనం', 'चोरी', 'திருட்டு', 'ಕಳ್ಳತನ', 'മോഷണം'],
  ['crime', 'నేరం', 'अपराध', 'குற்றம்', 'ಅಪರಾಧ', 'കുറ്റകൃത്യം'],
  ['election', 'ఎన్నికలు', 'चुनाव', 'தேர்தல்', 'ಚುನಾವಣೆ', 'തിരഞ്ഞെടുപ്പ്'],
  ['vote', 'ఓటు', 'वोट', 'வாக்கு', 'ಮತ', 'വോട്ട്'],
  ['minister', 'మంత్రి', 'मंत्री', 'அமைச்சர்', 'ಮಂತ್ರಿ', 'മന്ത്രി'],
  ['government', 'ప్రభుత్వం', 'सरकार', 'அரசு', 'ಸರ್ಕಾರ', 'സർക്കാർ'],
  ['price', 'ధర', 'कीमत', 'விலை', 'ಬೆಲೆ', 'വില'],
  ['corruption', 'అవినీతి', 'भ्रष्टाचार', 'ஊழல்', 'ಭ್ರಷ್ಟಾಚಾರ', 'അഴിമതി'],
  ['strike', 'సమ్మె', 'हड़ताल', 'வேலைநிறுத்தம்', 'ಮುಷ್ಕರ', 'പണിമുടക്ക്'],
  ['temple', 'దేవాలయం', 'मंदिर', 'கோவில்', 'ದೇವಸ್ಥಾನ', 'ക്ഷേത്രം'],
  ['festival', 'పండుగ', 'त्योहार', 'திருவிழா', 'ಹಬ್ಬ', 'ഉത്സവം'],
  ['women', 'మహిళలు', 'महिलाएं', 'பெண்கள்', 'ಮಹಿಳೆಯರು', 'സ്ത്രീകൾ'],
  ['students', 'విద్యార్థులు', 'छात्र', 'மாணவர்கள்', 'ವಿದ್ಯಾರ್ಥಿಗಳು', 'വിദ്യാർത്ഥികൾ'],
  ['news', 'వార్తలు', 'समाचार', 'செய்திகள்', 'ಸುದ್ದಿ', 'വാർത്ത'],
  ['bus', 'బస్సు', 'बस', 'பேருந்து', 'ಬಸ್', 'ബസ്'],
  ['pension', 'పింఛను', 'पेंशन', 'ஓய்வூதியம்', 'ಪಿಂಚಣಿ', 'പെൻഷൻ'],
  ['ration', 'రేషన్', 'राशन', 'ரேஷன்', 'ಪಡಿತರ', 'റേഷൻ'],
  ['land', 'భూమి', 'जमीन', 'நிலம்', 'ಭೂಮಿ', 'ഭൂമി'],
  ['job', 'ఉద్యోగం', 'नौकरी', 'வேலை', 'ಉದ್ಯೋಗ', 'ജോലി'],
];

const COLS = { te: 1, hi: 2, ta: 3, kn: 4, ml: 5 };

/** Same row order as KEYWORD_TABLE. */
const EXTRA_KEYWORDS = {
  es: split2('policía|arresto|protesta|manifestación|reunión|queja|carretera|agua|electricidad|hospital|escuela|agricultor|lluvia|inundación|incendio|accidente|asesinato|robo|delito|elecciones|voto|ministro|gobierno|precio|corrupción|huelga|templo|festival|mujeres|estudiantes|noticias|autobús|pensión|ración|tierra|empleo'),
  fr: split2('police|arrestation|manifestation|rassemblement|réunion|plainte|route|eau|électricité|hôpital|école|agriculteur|pluie|inondation|incendie|accident|meurtre|vol|crime|élections|vote|ministre|gouvernement|prix|corruption|grève|temple|festival|femmes|étudiants|actualités|bus|pension|ration|terre|emploi'),
  ar: split2('شرطة|اعتقال|احتجاج|مسيرة|اجتماع|شكوى|طريق|ماء|كهرباء|مستشفى|مدرسة|مزارع|مطر|فيضان|حريق|حادث|قتل|سرقة|جريمة|انتخابات|تصويت|وزير|حكومة|سعر|فساد|إضراب|معبد|مهرجان|نساء|طلاب|أخبار|حافلة|معاش|حصة تموينية|أرض|وظيفة'),
  bn: split2('পুলিশ|গ্রেপ্তার|বিক্ষোভ|মিছিল|সভা|অভিযোগ|রাস্তা|পানি|বিদ্যুৎ|হাসপাতাল|বিদ্যালয়|কৃষক|বৃষ্টি|বন্যা|অগ্নিকাণ্ড|দুর্ঘটনা|খুন|চুরি|অপরাধ|নির্বাচন|ভোট|মন্ত্রী|সরকার|দাম|দুর্নীতি|ধর্মঘট|মন্দির|উৎসব|নারী|শিক্ষার্থী|সংবাদ|বাস|ভাতা|রেশন|জমি|চাকরি'),
  ur: split2('پولیس|گرفتاری|احتجاج|ریلی|اجلاس|شکایت|سڑک|پانی|بجلی|ہسپتال|اسکول|کسان|بارش|سیلاب|آگ|حادثہ|قتل|چوری|جرم|انتخابات|ووٹ|وزیر|حکومت|قیمت|بدعنوانی|ہڑتال|مندر|تہوار|خواتین|طلباء|خبریں|بس|پنشن|راشن|زمین|نوکری'),
};

/* Hangul: compose jamo typed one by one into syllables. */
const H_L = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const H_V = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const H_T = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const H_VOWEL_JOIN = { ㅗㅏ: 'ㅘ', ㅗㅐ: 'ㅙ', ㅗㅣ: 'ㅚ', ㅜㅓ: 'ㅝ', ㅜㅔ: 'ㅞ', ㅜㅣ: 'ㅟ', ㅡㅣ: 'ㅢ' };
// jongseong + consonant → double final (ㄱ+ㅅ → ㄳ …)
const H_FINAL_JOIN = { ㄱㅅ: 'ㄳ', ㄴㅈ: 'ㄵ', ㄴㅎ: 'ㄶ', ㄹㄱ: 'ㄺ', ㄹㅁ: 'ㄻ', ㄹㅂ: 'ㄼ', ㄹㅅ: 'ㄽ', ㄹㅌ: 'ㄾ', ㄹㅍ: 'ㄿ', ㄹㅎ: 'ㅀ', ㅂㅅ: 'ㅄ' };
const H_FINAL_SPLIT = Object.fromEntries(Object.entries(H_FINAL_JOIN).map(([k, v]) => [v, [...k]]));

function hangulParts(ch) {
  const c = ch.codePointAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) {
    const n = c - 0xac00;
    return { L: H_L[Math.floor(n / 588)], V: H_V[Math.floor((n % 588) / 28)], T: H_T[n % 28] };
  }
  if (H_L.includes(ch)) return { L: ch };
  if (H_V.includes(ch)) return { V: ch };
  return null;
}
const hangulChar = ({ L, V, T }) =>
  L && V
    ? String.fromCharCode(0xac00 + H_L.indexOf(L) * 588 + H_V.indexOf(V) * 28 + Math.max(H_T.indexOf(T || ''), 0))
    : L || V || '';

/** Append a jamo to text, merging with the previous syllable when it composes. */
function composeHangul(before, key) {
  const last = Array.from(before).pop();
  const cur = last && hangulParts(last);
  const head = before.slice(0, before.length - (last ? last.length : 0));
  const isC = H_L.includes(key) || H_T.includes(key);
  const isV = H_V.includes(key);
  if (!cur || (!isC && !isV)) return before + key;
  if (isC) {
    if (cur.L && cur.V && !cur.T && H_T.includes(key) && key !== 'ㄸ' && key !== 'ㅃ' && key !== 'ㅉ') {
      return head + hangulChar({ ...cur, T: key });
    }
    if (cur.T && H_FINAL_JOIN[cur.T + key]) return head + hangulChar({ ...cur, T: H_FINAL_JOIN[cur.T + key] });
    return before + key;
  }
  // vowel
  if (cur.L && !cur.V) return head + hangulChar({ L: cur.L, V: key });
  if (cur.L && cur.V && !cur.T) {
    const j = H_VOWEL_JOIN[cur.V + key];
    return j ? head + hangulChar({ ...cur, V: j }) : before + key;
  }
  if (cur.L && cur.V && cur.T) {
    // final consonant moves to the new syllable as its initial
    const split = H_FINAL_SPLIT[cur.T];
    const keepT = split ? split[0] : '';
    const moved = split ? split[1] : cur.T;
    if (H_L.includes(moved)) {
      return head + hangulChar({ L: cur.L, V: cur.V, T: keepT }) + hangulChar({ L: moved, V: key });
    }
  }
  if (cur.V && !cur.L && H_VOWEL_JOIN[cur.V + key]) return head + H_VOWEL_JOIN[cur.V + key];
  return before + key;
}

/** Text before the caret + typed key → new text before the caret. */
export function composeKey(code, before, key) {
  return code === 'ko' ? composeHangul(before, key) : before + key;
}

const LATIN_LANGS = new Set(['en', 'es', 'fr', 'de', 'pt', 'it', 'tr']);
/** Non-Latin languages: Latin letters are not accepted in their search bars. */
export const blocksLatin = (code) => !LATIN_LANGS.has(code);

/** Instant English meaning for words found in the built-in keyword list. */
export function lookupEnglish(code, text) {
  const col = COLS[code];
  const extra = EXTRA_KEYWORDS[code];
  if (!col && !extra) return '';
  const native = KEYWORD_TABLE.map((row, i) => [col ? row[col] : extra[i], row[0]]);
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const out = [];
  let i = 0;
  while (i < words.length) {
    let hit = null;
    for (let n = Math.min(3, words.length - i); n >= 1 && !hit; n--) {
      const phrase = words.slice(i, i + n).join(' ');
      const m = native.find(([nat]) => nat === phrase);
      if (m) { hit = [m[1], n]; }
    }
    if (hit) { out.push(hit[0]); i += hit[1]; } else { out.push(words[i]); i += 1; }
  }
  const joined = out.join(' ');
  return joined === text.trim() ? '' : joined;
}

export const getLanguage = (code) =>
  KEYBOARD_LANGUAGES.find((l) => l.code === code) || KEYBOARD_LANGUAGES[0];

/** Suggestions for a typed token: { text, english } (english omitted for English). */
export function suggestKeywords(code, token, limit = 6) {
  const q = String(token || '').trim().toLowerCase();
  if (!q) return [];
  const col = COLS[code];
  const extra = EXTRA_KEYWORDS[code];
  const translated = Boolean(col || extra);
  const out = [];
  KEYWORD_TABLE.forEach((row, i) => {
    const en = row[0];
    const native = col ? row[col] : extra ? extra[i] : en;
    const nativeL = native.toLowerCase();
    const enL = en.toLowerCase();
    const starts = nativeL.startsWith(q) || enL.startsWith(q);
    if (starts || nativeL.includes(q) || enL.includes(q)) {
      out.push({ text: native, english: translated ? en : null, rank: starts ? 0 : 1 });
    }
  });
  return out.sort((a, b) => a.rank - b.rank).slice(0, limit);
}

/* ── tenant selection ──────────────────────────────────────────────────────
 * Source of truth is users.keyboard_language in the DB (shared by the tenant).
 * AuthProvider calls hydrateKeyboardLanguage() with the value from /auth/me;
 * localStorage only provides an instant first paint before /me returns.
 */

const host = () => {
  try {
    return String(window.location.host || 'default').toLowerCase();
  } catch {
    return 'default';
  }
};
const storageKey = () => `keyboard_language:${host()}`;
const isKnown = (code) => KEYBOARD_LANGUAGES.some((l) => l.code === code);

let current = null;
const listeners = new Set();

export function getKeyboardLanguage() {
  if (current) return current;
  try {
    const code = window.localStorage.getItem(storageKey());
    if (code && isKnown(code)) return code;
  } catch { /* storage unavailable */ }
  return 'en';
}

export function hydrateKeyboardLanguage(code) {
  if (!code || !isKnown(code) || code === current) return;
  current = code;
  try {
    window.localStorage.setItem(storageKey(), code);
  } catch { /* storage unavailable */ }
  listeners.forEach((fn) => fn());
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function useKeyboardLanguage() {
  return useSyncExternalStore(subscribe, getKeyboardLanguage, () => 'en');
}
