package llm

const EtymologyPrompt = `Analyze the etymology of the word "%s".

You must respond ONLY with a valid JSON object, no other text before or after. Do not include any markdown formatting or code blocks.

{
  "word": "the word",
  "origin": {
    "language": "the source language (e.g., Latin, Greek, Old English)",
    "root": "the original root word",
    "components": [
      {"part": "prefix or root part", "meaning": "meaning of this part"}
    ]
  },
  "evolution": "brief evolution path (e.g., Latin word → Old French → Middle English → Modern English)",
  "originalMeaning": "the original meaning in the source language",
  "modernMeaning": "the current meaning in modern English"
}`

const DerivativesPrompt = `List words that share the same etymological root as "%s".

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
