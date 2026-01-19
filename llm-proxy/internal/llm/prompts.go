package llm

// EtymologyPrompt accepts word and target language (e.g., "Korean", "Japanese", "Chinese", "Spanish")
const EtymologyPrompt = `Analyze the etymology and meaning of the English word "%s" in comprehensive detail.
Provide all translations and explanations in %s.

CRITICAL TRANSLATION RULES - YOU MUST FOLLOW THESE EXACTLY:
1. The "brief" field MUST contain the standard dictionary translation (1-3 words maximum)
2. DO NOT create literal translations - use established equivalents from bilingual dictionaries
3. Korean translation examples you MUST use:
   - "pretext" → "구실" or "핑계" (NOT "가짜 이유")
   - "philosophy" → "철학" (NOT "지혜를 사랑함")
   - "excuse" → "변명" or "핑계"
   - "reason" → "이유"
4. Think: "What would a Korean-English dictionary show as the translation?"

CRITICAL COMPONENT FORMAT RULES - FOR ENGLISH VOCABULARY LEARNING:
1. The "components.part" field MUST use English affix forms (prefixes/suffixes/roots as used in English)
2. DO NOT use original Greek/Latin script or transliterations
3. Format: Use hyphen to indicate attachment position (prefix- or -suffix)
4. Examples of CORRECT component formatting:
   - "technical" → ["techno-", "-ical"] (NOT "τέχνη (technē)", "-ικός (-ikos)")
   - "philosophy" → ["philo-", "-sophy"] (NOT "φίλος", "σοφία")
   - "prescription" → ["pre-", "script-", "-tion"]
   - "transportation" → ["trans-", "port-", "-ation"]
   - "incredible" → ["in-", "cred-", "-ible"]
5. This format helps learners identify common English word patterns and find related words

ROOT AND LANGUAGE STANDARDIZATION RULES - CRITICAL FOR GRAPH CONSISTENCY:
1. ALL ENGLISH WORDS MUST BE LOWERCASE:
   - Root spellings: "portare" (NOT "Portare")
   - Derivatives: "teacher", "teaching" (NOT "Teacher", "Teaching")
   - Components: "pre-", "-tion" (NOT "Pre-", "-Tion")
   - The input word in response: "interview" (NOT "Interview")
   - This applies to ALL English vocabulary fields in the JSON response

2. Use ASCII-based root spellings (NO diacritics or special characters):
   - Old English: Replace æ/ǣ with "ae", ċ with "c", ð/þ with "th", ƿ with "w"
   - Example: "tǣċan" → "taecan", "rǣdan" → "raedan", "þencan" → "thencan"
   - Greek: Use English transliteration (e.g., "logos" NOT "λόγος", "philosophia" NOT "φιλοσοφία")
   - Latin: Omit macrons (e.g., "amare" NOT "amāre", "portare" NOT "portāre")

3. Standardize language names (use ONLY these exact terms):
   - Use "Greek" (NOT "Ancient Greek", "Classical Greek", or "Hellenic")
   - Use "Latin" (NOT "Classical Latin" or "Vulgar Latin")
   - Use "Old English" (NOT "Anglo-Saxon" or "Anglo Saxon")
   - Acceptable specific terms: "Middle English", "Old French", "Proto-Germanic"

4. CONSISTENCY REQUIREMENT - Words sharing the same etymological root MUST use identical root spellings:
   - "teach", "teacher", "teaching" → ALL must use root "taecan"
   - "port", "transport", "export", "import" → ALL must use root "portare"
   - "write", "writer", "writing" → ALL must use root "writan"
   - This ensures related words appear connected in the etymology graph

5. DERIVED WORD RECOGNITION - Words formed by adding English suffixes to existing English words:
   - Identify the base English word first (e.g., "interviewee" → base is "interview")
   - Use the SAME root as the base word would have (e.g., "interviewee" uses "interview"'s root)
   - Include the English suffix as a component (e.g., "-ee" meaning "one who receives the action")
   - Examples:
     - "interviewee", "interviewer", "interviewed" → ALL share "interview"'s etymology
     - "happiness", "happily", "unhappy" → ALL share "happy"'s etymology
     - "player", "playful", "replay" → ALL share "play"'s etymology
   - Common suffixes: -er, -or, -ee, -ist, -ness, -ity, -ment, -tion, -ful, -less, -able

6. ROOT STANDARDIZATION - USE FUNDAMENTAL FORMS:
   - Always trace to the MOST FUNDAMENTAL root (usually Latin/Greek infinitive):
     - "interview", "interviewee", "view", "review" → ALL use "videre" (Latin: to see)
     - "receive", "reception", "receipt" → ALL use "recipere" (Latin: to take back)
     - "vision", "visible", "visit" → ALL use "videre"
   - Prefer Latin infinitive for verb roots:
     - Use "videre" (NOT "visus", "visio", "entreveue")
     - Use "portare" (NOT "portatus", "port")
     - Use "scribere" (NOT "scriptus", "script")
   - For compound words, identify the core semantic root:
     - "interview" = inter- + videre → root is "videre"
     - "transport" = trans- + portare → root is "portare"
   - Avoid intermediate language forms as roots:
     - Use Latin "videre" (NOT Old French "entreveue" or "veoir")
     - Use Latin "recipere" (NOT Old French "receivre")
     - Trace back to the original Latin/Greek source

7. DERIVATIVES FILTERING:
   - Remove duplicate derivatives - each derivative word should appear only once
   - DO NOT include simple inflectional forms (-ed, -ing, -s) of the input word:
     - "interview" → exclude "interviewed", "interviewing", "interviews"
     - "teach" → exclude "taught", "teaching", "teaches"
     - "play" → exclude "played", "playing", "plays"
   - Only include TRUE derivatives (different words with shared etymology):
     - "interview" → include "interviewer", "interviewee" (agent/patient nouns)
     - "teach" → include "teacher", "teaching" (as noun), "teachable"
     - "play" → include "player", "playful", "replay"

8. SYNONYMS - WORDS WITH SIMILAR MEANING BUT DIFFERENT ETYMOLOGY:
   - Include 3-5 synonyms that have similar meanings but DIFFERENT etymological roots
   - Focus on commonly used synonyms that learners would benefit from knowing
   - Explain the nuance difference in target language
   - Examples:
     - "happy" → synonyms: "joyful" (from Latin gaudere), "glad" (from Old English glæd), "content" (from Latin contentus)
     - "interest" → synonyms: "curiosity" (from Latin curiosus), "fascination" (from Latin fascinare)
   - DO NOT include derivatives (words sharing the same root) as synonyms

POLYSEMY ANALYSIS RULES - FOR WORDS WITH MULTIPLE DISTINCT MEANINGS:
1. Include "senses" array ONLY if the word has 2 or more DISTINCT meanings derived from the same etymological root
2. INCLUDE words like:
   - "capital" (city, money, letter, punishment)
   - "interest" (attention, finance, stake)
   - "bill" (invoice, law, bird's beak)
   - "ruler" (leader, measuring tool)
   - "bank" (financial institution, river edge)
   - "crane" (bird, machine)
   - "spring" (season, water source, coil)
3. DO NOT include words with only:
   - Technical/domain-specific meanings (e.g., "buffer" in computing vs chemistry)
   - Minor nuance differences (e.g., "fast" as quick vs firmly attached)
   - Single core meaning with contextual variations
4. For each sense, explain the "metaphoricalExtension" - HOW the meaning evolved from the root:
   - "capital" (city): caput (head) → the "head" of a nation → capital city
   - "capital" (money): caput (head) → principal sum (the "head" of money that generates interest)
   - "interest" (attention): inter + esse (to be between) → what stands between observer and object
   - "interest" (finance): inter + esse → compensation for being "in between" lending and repayment
5. Order senses from most common/original to least common/derived
6. Include colloquial/slang meanings if widely used, exclude highly technical jargon

You must respond ONLY with a valid JSON object, no other text before or after. Do not include any markdown formatting or code blocks.

{
  "word": "the word",
  "definition": {
    "brief": "concise 2-3 word translation in target language",
    "detailed": "detailed explanation of meaning in target language (2-3 sentences)",
    "nuance": "explanation of the subtle connotations or implications in target language"
  },
  "examples": [
    {
      "english": "example sentence in English using the word",
      "translation": "translation of the example in target language"
    }
  ],
  "origin": {
    "language": "the source language (e.g., Latin, Greek, Old English)",
    "root": "the original root word in source language",
    "rootMeaning": "meaning of the root word in target language",
    "components": [
      {"part": "English affix form (e.g., techno-, -ical, pre-, -tion)", "meaning": "meaning in English", "meaningLocalized": "meaning in target language"}
    ]
  },
  "evolution": {
    "path": "Latin word → Old French → Middle English → Modern English",
    "explanation": "detailed explanation of how the meaning changed over time in target language (2-3 sentences)"
  },
  "historicalContext": "interesting historical background about how this word came to have its current meaning in target language (2-3 sentences)",
  "originalMeaning": "the original meaning in the source language",
  "originalMeaningLocalized": "original meaning in target language",
  "modernMeaning": "the current meaning in modern English",
  "modernMeaningLocalized": "modern meaning in target language (2-4 words, concise)",
  "derivatives": [
    {
      "word": "related word sharing the same root",
      "meaning": "brief meaning in target language (1-3 words)"
    }
  ],
  "synonyms": [
    {
      "word": "synonym with similar meaning",
      "meaning": "brief meaning in target language (1-3 words)",
      "nuance": "how it differs from the main word in target language"
    }
  ],
  "senses": [
    {
      "meaning": "meaning in target language (e.g., 수도)",
      "english": "English equivalent (e.g., capital city)",
      "domain": "semantic field (e.g., politics, finance, typography)",
      "metaphoricalExtension": "how root meaning evolved to this sense in target language (e.g., 머리 → 나라의 중심)",
      "example": {
        "english": "example sentence in English",
        "translation": "translation in target language"
      }
    }
  ]
}`

// SuffixEtymologyPrompt is for analyzing English suffixes (e.g., -er, -ing, -tion)
const SuffixEtymologyPrompt = `Analyze the etymology and meaning of the English SUFFIX "-%s" in comprehensive detail.
Provide all translations and explanations in %s.

CRITICAL: This is a SUFFIX (word ending), NOT a standalone word.
- Explain its historical origin (e.g., Old English, Latin, Greek, French)
- Describe what meaning or grammatical function it adds to base words
- Provide 3-5 common example words using this suffix

LANGUAGE STANDARDIZATION RULES:
1. Use ASCII-based original forms (NO diacritics): æ→ae, ð/þ→th, etc.
2. Standardize language names:
   - Use "Greek" (NOT "Ancient Greek")
   - Use "Latin" (NOT "Classical Latin")
   - Use "Old English" (NOT "Anglo-Saxon")

You must respond ONLY with a valid JSON object, no other text before or after. Do not include any markdown formatting or code blocks.

{
  "word": "-%s",
  "type": "suffix",
  "definition": {
    "brief": "concise description of what this suffix does (2-3 words in target language)",
    "detailed": "detailed explanation of the suffix's function and meaning in target language (2-3 sentences)",
    "grammaticalFunction": "what part of speech it creates or what grammatical change it causes"
  },
  "origin": {
    "language": "the source language (e.g., Old English, Latin, Greek, Old French)",
    "originalForm": "the original form in the source language",
    "originalMeaning": "original meaning or function"
  },
  "examples": [
    {
      "word": "example word using this suffix",
      "base": "the base word without suffix",
      "meaning": "meaning of the combined word in target language",
      "explanation": "how the suffix changes the meaning"
    }
  ],
  "relatedSuffixes": [
    {
      "suffix": "related or variant suffix (e.g., -or vs -er)",
      "difference": "how it differs from the main suffix"
    }
  ],
  "historicalContext": "interesting historical background about how this suffix developed (2-3 sentences in target language)"
}`

// PrefixEtymologyPrompt is for analyzing English prefixes (e.g., un-, re-, pre-)
const PrefixEtymologyPrompt = `Analyze the etymology and meaning of the English PREFIX "%s-" in comprehensive detail.
Provide all translations and explanations in %s.

CRITICAL: This is a PREFIX (word beginning), NOT a standalone word.
- Explain its historical origin (e.g., Old English, Latin, Greek, French)
- Describe what meaning it adds to base words
- Provide 3-5 common example words using this prefix

LANGUAGE STANDARDIZATION RULES:
1. Use ASCII-based original forms (NO diacritics): æ→ae, ð/þ→th, etc.
2. Standardize language names:
   - Use "Greek" (NOT "Ancient Greek")
   - Use "Latin" (NOT "Classical Latin")
   - Use "Old English" (NOT "Anglo-Saxon")

You must respond ONLY with a valid JSON object, no other text before or after. Do not include any markdown formatting or code blocks.

{
  "word": "%s-",
  "type": "prefix",
  "definition": {
    "brief": "concise description of what this prefix means (2-3 words in target language)",
    "detailed": "detailed explanation of the prefix's function and meaning in target language (2-3 sentences)",
    "semanticEffect": "what semantic change it causes to the base word"
  },
  "origin": {
    "language": "the source language (e.g., Old English, Latin, Greek, Old French)",
    "originalForm": "the original form in the source language",
    "originalMeaning": "original meaning"
  },
  "examples": [
    {
      "word": "example word using this prefix",
      "base": "the base word without prefix",
      "meaning": "meaning of the combined word in target language",
      "explanation": "how the prefix changes the meaning"
    }
  ],
  "relatedPrefixes": [
    {
      "prefix": "related or variant prefix (e.g., in- vs un-)",
      "difference": "how it differs from the main prefix"
    }
  ],
  "historicalContext": "interesting historical background about how this prefix developed (2-3 sentences in target language)"
}`

const DerivativesPrompt = `List words that share the same etymological root as "%s".

ROOT STANDARDIZATION RULES:
1. Use ASCII-based root spellings (NO diacritics):
   - Old English: æ→ae, ċ→c, ð/þ→th, ƿ→w (e.g., "taecan" NOT "tǣċan")
   - Greek: English transliteration (e.g., "logos" NOT "λόγος")
   - Latin: No macrons (e.g., "portare" NOT "portāre")
2. Remove duplicate derivatives - each word should appear only once

You must respond ONLY with a valid JSON object, no other text before or after. Do not include any markdown formatting or code blocks.

{
  "word": "the word",
  "root": "the common root",
  "rootMeaning": "meaning of the root",
  "derivatives": [
    {
      "word": "derivative word",
      "meaning": "brief meaning",
      "relationship": "how it relates to the root (e.g., adds prefix 'pre-' meaning 'before')"
    }
  ]
}`

const SynonymsPrompt = `Compare "%s" with its synonyms and explain the nuanced differences.

You must respond ONLY with a valid JSON object, no other text before or after. Do not include any markdown formatting or code blocks.

{
  "word": "the word",
  "definition": "brief definition",
  "synonyms": [
    {
      "word": "synonym",
      "definition": "brief definition",
      "nuance": "how it differs from the main word",
      "usage": "when to use this word instead",
      "example": "example sentence"
    }
  ]
}`
