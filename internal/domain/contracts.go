package domain

import "strings"

const NoteTextMaxLength = 1024

var NoteColorPalette = []string{
	"#fff7cc",
	"#ffd6d6",
	"#d6ecff",
	"#dcfce7",
	"#f3e8ff",
	"#f5f5f4",
}

const DefaultNoteColor = "#fff7cc"

func ValidateProjectName(name string) bool {
	return strings.TrimSpace(name) != ""
}

func ValidateNoteText(text string) bool {
	return strings.TrimSpace(text) != "" && len(text) <= NoteTextMaxLength
}

func NormalizeTags(tags []string) []string {
	seen := map[string]struct{}{}
	normalized := []string{}

	for _, tag := range tags {
		clean := strings.TrimSpace(tag)
		if clean == "" {
			continue
		}

		key := strings.ToLower(clean)
		if _, exists := seen[key]; exists {
			continue
		}

		seen[key] = struct{}{}
		normalized = append(normalized, clean)
	}

	return normalized
}

func ValidNoteColor(color string) bool {
	for _, paletteColor := range NoteColorPalette {
		if color == paletteColor {
			return true
		}
	}

	return false
}
