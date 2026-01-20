package filter

import (
	"strings"
)

// FilterDerivatives removes grammatical variations of the input word from derivatives.
// For example, "interest" should not have "interested", "interesting", "interestingly" as derivatives.
func FilterDerivatives(word string, derivatives []interface{}) []interface{} {
	if len(derivatives) == 0 {
		return []interface{}{}
	}

	word = strings.ToLower(word)
	variations := generateVariations(word)

	filtered := make([]interface{}, 0)
	for _, d := range derivatives {
		derivMap, ok := d.(map[string]interface{})
		if !ok {
			continue
		}

		derivWord, ok := derivMap["word"].(string)
		if !ok {
			continue
		}

		derivWordLower := strings.ToLower(derivWord)
		if !isVariation(derivWordLower, variations, word) {
			filtered = append(filtered, d)
		}
	}

	return filtered
}

// generateVariations creates common grammatical variations of a word.
func generateVariations(word string) map[string]bool {
	variations := make(map[string]bool)

	// The word itself
	variations[word] = true

	// Plural forms
	variations[word+"s"] = true
	variations[word+"es"] = true
	if strings.HasSuffix(word, "y") {
		variations[word[:len(word)-1]+"ies"] = true
	}

	// Verb forms (-ed, -ing)
	variations[word+"ed"] = true
	variations[word+"ing"] = true

	// Handle consonant doubling (e.g., stop -> stopped, stopping)
	if len(word) >= 3 && isConsonant(word[len(word)-1]) && isVowel(word[len(word)-2]) && isConsonant(word[len(word)-3]) {
		doubled := word + string(word[len(word)-1])
		variations[doubled+"ed"] = true
		variations[doubled+"ing"] = true
	}

	// Handle words ending in 'e' (e.g., make -> making, made)
	if strings.HasSuffix(word, "e") {
		base := word[:len(word)-1]
		variations[base+"ing"] = true
		variations[base+"ed"] = true
	}

	// Handle words ending in consonant+y (e.g., carry -> carried)
	if strings.HasSuffix(word, "y") && len(word) >= 2 && isConsonant(word[len(word)-2]) {
		base := word[:len(word)-1]
		variations[base+"ied"] = true
		variations[base+"ies"] = true
	}

	// Adverb form (-ly)
	variations[word+"ly"] = true
	if strings.HasSuffix(word, "y") {
		variations[word[:len(word)-1]+"ily"] = true
	}
	if strings.HasSuffix(word, "le") {
		variations[word[:len(word)-1]+"y"] = true
	}
	if strings.HasSuffix(word, "ic") {
		variations[word+"ally"] = true
	}

	// Adverb forms from adjective forms (-ing + ly, -ed + ly)
	// e.g., interest → interesting → interestingly
	variations[word+"ingly"] = true
	variations[word+"edly"] = true

	// Adjective forms from verbs (-ed, -ing as adjectives)
	// These are the same as verb forms, already added above

	// Common suffixes that create "same word" variants
	// -er (comparative), -est (superlative)
	variations[word+"er"] = true
	variations[word+"est"] = true
	if strings.HasSuffix(word, "e") {
		variations[word+"r"] = true
		variations[word+"st"] = true
	}
	if strings.HasSuffix(word, "y") && len(word) >= 2 && isConsonant(word[len(word)-2]) {
		base := word[:len(word)-1]
		variations[base+"ier"] = true
		variations[base+"iest"] = true
	}

	return variations
}

// isVariation checks if a derivative word is a variation of the base word.
func isVariation(derivWord string, variations map[string]bool, baseWord string) bool {
	// Direct match with generated variations
	if variations[derivWord] {
		return true
	}

	// Compound words containing the base word are not true derivatives
	// e.g., "interest rate", "interest group" for "interest"
	if strings.Contains(derivWord, " ") && strings.Contains(derivWord, baseWord) {
		return true
	}

	return false
}

func isVowel(c byte) bool {
	return c == 'a' || c == 'e' || c == 'i' || c == 'o' || c == 'u'
}

func isConsonant(c byte) bool {
	return c >= 'a' && c <= 'z' && !isVowel(c)
}
