/**
 * Language detection and localization utilities
 */

import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, type SupportedLanguage } from '../config/constants.js';

/**
 * Common text patterns for language detection
 * Simple heuristic-based detection (production would use langdetect or similar)
 */
const LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
  en: [/^[a-zA-Z\s]+$/, /\b(the|and|is|are|was|were|have|has|will|would|could|should)\b/i],
  es: [/\b(el|la|los|las|de|en|que|y|es|con|por|un|una)\b/i, /[áéíóúñü¿¡]/],
  fr: [/\b(le|la|les|de|et|est|en|que|un|une|du|au)\b/i, /[àâéèëêïîôùûüÿœç]/],
  de: [/\b(der|die|das|und|ist|ein|eine|von|mit|nicht|auch)\b/i, /[äöüß]/],
  it: [/\b(il|la|le|gli|di|e|è|un|una|non|anche)\b/i, /[àèéìòù]/],
  pt: [/\b(o|a|os|as|de|e|é|um|uma|não|também)\b/i, /[ãõáéíóúâêôàç]/],
  ja: [/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/],
  zh: [/[\u4e00-\u9fff\u3400-\u4dbf]/],
  ko: [/[\uac00-\ud7af\u1100-\u11ff]/],
  ar: [/[\u0600-\u06ff]/],
  hi: [/[\u0900-\u097f]/],
  ru: [/[\u0400-\u04ff]/],
  th: [/[\u0e00-\u0e7f]/],
};

/**
 * Detect language from input text
 * Returns ISO 639-1 language code
 */
export function detectLanguage(text: string): SupportedLanguage {
  if (!text || text.trim().length === 0) {
    return DEFAULT_LANGUAGE;
  }

  // Score each language based on pattern matches
  const scores: Record<string, number> = {};

  for (const [lang, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        score += pattern.source.length; // Weight by pattern specificity
      }
    }
    if (score > 0) {
      scores[lang] = score;
    }
  }

  // Return highest scoring language, or default
  let bestLang = DEFAULT_LANGUAGE;
  let bestScore = 0;
  for (const [lang, score] of Object.entries(scores)) {
    if (score > bestScore && SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
      bestScore = score;
      bestLang = lang as SupportedLanguage;
    }
  }

  return bestLang;
}

/**
 * Validate an ISO 639-1 language code
 */
export function isValidLanguageCode(code: string): boolean {
  return SUPPORTED_LANGUAGES.includes(code as SupportedLanguage);
}

/**
 * Localized fallback questions for clarification
 * Used when Gemini is unavailable or as a backup
 */
export const FALLBACK_QUESTIONS: Record<SupportedLanguage, string> = {
  en: 'Could you please provide more details about what you need help with?',
  es: '¿Podría proporcionar más detalles sobre lo que necesita ayuda?',
  fr: 'Pourriez-vous fournir plus de détails sur ce dont vous avez besoin?',
  de: 'Könnten Sie bitte mehr Details dazu angeben, wobei Sie Hilfe benötigen?',
  it: 'Potrebbe fornire maggiori dettagli su ciò di cui ha bisogno?',
  pt: 'Poderia fornecer mais detalhes sobre o que você precisa?',
  nl: 'Kunt u meer details geven over waarmee u hulp nodig heeft?',
  pl: 'Czy mógłby Pan/Pani podać więcej szczegółów dotyczących tego, w czym potrzebuje pomocy?',
  ru: 'Не могли бы вы предоставить больше деталей о том, с чем вам нужна помощь?',
  ja: '何についてお手伝いすればよいか、もう少し詳しく教えていただけますか？',
  zh: '您能提供更多关于您需要什么帮助的详细信息吗？',
  ko: '어떤 도움이 필요하신지 더 자세히 알려주시겠어요?',
  ar: 'هل يمكنك تقديم المزيد من التفاصيل حول ما تحتاج المساعدة فيه؟',
  hi: 'क्या आप विस्तार से बता सकते हैं कि आपको किस चीज़ में मदद चाहिए?',
  tr: 'Hangi konuda yardıma ihtiyacınız olduğunu daha detaylı anlatabilir misiniz?',
  vi: 'Bạn có thể cung cấp thêm chi tiết về những gì bạn cần giúp đỡ không?',
  th: 'คุณช่วยระบุรายละเอียดเพิ่มเติมได้ไหมว่าต้องการความช่วยเหลือในเรื่องใด?',
  id: 'Bisakah Anda memberikan lebih banyak detail tentang apa yang Anda butuhkan?',
  ms: 'Bolehkah anda memberikan lebih banyak butiran tentang apa yang anda perlukan?',
  tl: 'Maaari bang magbigay ng higit pang mga detalye tungkol sa kung ano ang kailangan mo ng tulong?',
  sv: 'Skulle du kunna ge fler detaljer om vad du behöver hjälp med?',
  no: 'Kunne du gi flere detaljer om hva du trenger hjelp til?',
  da: 'Kunne du give flere detaljer om, hvad du har brug for hjælp til?',
  fi: 'Voisitko antaa lisätietoja siitä, missä tarvitset apua?',
  cs: 'Mohli byste poskytnout více podrobností o tom, s čím potřebujete pomoci?',
  hu: 'Tudna több részletet megadni arról, miben van szüksége segítségre?',
  ro: 'Ați putea oferi mai multe detalii despre ce aveți nevoie de ajutor?',
  uk: 'Чи могли б ви надати більше деталей про те, з чим вам потрібна допомога?',
  el: 'Θα μπορούσατε να δώσετε περισσότερες λεπτομέρειες για το τι χρειάζεστε βοήθεια;',
  he: 'האם תוכל לספק יותר פרטים על מה שאתה צריך עזרה?',
  bn: 'আপনি কি বিস্তারিত বলতে পারেন যে আপনার কী সাহায্য দরকার?',
  ta: 'நீங்கள் உதவி தேவைப்படும் விஷயத்தை பற்றி மேலும் விவரங்களை தர முடியுமா?',
  te: 'మీకు సహాయం కావలసిన విషయం గురించి మరింత వివరాలు ఇవ్వగలరా?',
  mr: 'तुम्हाला कोणत्या गोष्टीत मदत हवी आहे याबद्दल अधिक तपशील देऊ शकता का?',
  ur: 'کیا آپ مزید تفصیل دے سکتے ہیں کہ آپ کو کس چیز میں مدد چاہیے؟',
  fa: 'آیا می‌توانید جزئیات بیشتری در مورد اینکه به چه کمکی نیاز دارید ارائه دهید？',
  sw: 'Je, unaweza kutoa maelezo zaidi kuhusu unachohitaji msaada?',
  am: 'ስለምን እርዳታ እንደሚፈልጉ ተጨማሪ ዝርዝር መስጠት ይችላሉ？',
  ne: 'तपाईंलाई के कुरामा मद्दत चाहिन्छ भन्ने बारे थप विवरण दिन सक्नुहुन्छ？',
  si: 'ඔබට උදව් අවශ්‍ය දේ පිළිබඳව වැඩිදුර විස්තර ලබා දිය හැකිද？',
  my: 'သင်အကူအညီလိုအပ်သည့်အရာအကြောင်း ပိုမိုအသေးစိတ်ပေးနိုင်ပါသလား？',
  km: 'តើអ្នកអាចផ្តល់ព័ត៌មានលម្អិតបន្ថែមអំពីអ្វីដែលអ្នកត្រូវការជំនួយទេ？',
  lo: 'ທ່ານສາມາດໃຫ້ຂໍ້ມູນລະອຽດເພີ່ມເຕີມກ່ຽວກັບສິ່ງທີ່ທ່ານຕ້ອງການຄວາມຊ່ວຍເຫຼືອບໍ່？',
  ka: 'შეგიძლიათ მოგვცეთ მეტი დეტალები იმის შესახებ, თუ რაში გჭირდებათ დახმარება？',
  hy: 'Կարո՞ղ եք ավելի մանրամասն ներկայացնել, թե ինչ օգնության կարիք ունեք:',
  az: 'Nə köməyə ehtiyacınız olduğunu daha ətraflı izah edə bilərsinizmi？',
  uz: 'Sizga qanday yordam kerakligi haqida batafsil maʼlumot bera olasizmi？',
  kk: 'Сізге қандай көмек керектігі туралы толығырақ айта аласыз ба？',
  mn: 'Танд ямар тусламж хэрэгтэй байгаа талаар илүү дэлгэрэнгүй мэдээлэл өгч чадах уу？',
  bo: 'ཁྱེད་ལ་རོགས་པ་ག་རེ་དགོས་པའི་སྐོར་ཞིབ་ཕྲ་གསལ་པོ་གནང་ཐུབ་བམ？',
};

/**
 * Get a localized clarification question
 * Falls back to English if language not supported
 */
export function getClarificationQuestion(language: string): string {
  const lang = SUPPORTED_LANGUAGES.includes(language as SupportedLanguage)
    ? (language as SupportedLanguage)
    : DEFAULT_LANGUAGE;

  return FALLBACK_QUESTIONS[lang] ?? FALLBACK_QUESTIONS.en;
}
