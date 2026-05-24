package domain

import (
	"reflect"
	"strings"
	"testing"
)

func TestValidateProjectName(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want bool
	}{
		{name: "empty", in: "", want: false},
		{name: "whitespace", in: "  \t\n", want: false},
		{name: "valid", in: "Roadmap", want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ValidateProjectName(tt.in)
			if got != tt.want {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestValidateNoteText(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want bool
	}{
		{name: "empty", in: "", want: false},
		{name: "whitespace", in: "   ", want: false},
		{name: "one character", in: "a", want: true},
		{name: "at maximum", in: strings.Repeat("a", NoteTextMaxLength), want: true},
		{name: "above maximum", in: strings.Repeat("a", NoteTextMaxLength+1), want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ValidateNoteText(tt.in)
			if got != tt.want {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestNormalizeTags(t *testing.T) {
	got := NormalizeTags([]string{" idea ", "", "IDEA", "todo", "Todo", "later"})
	want := []string{"idea", "todo", "later"}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestValidNoteColor(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want bool
	}{
		{name: "default palette color", in: DefaultNoteColor, want: true},
		{name: "another palette color", in: "#d6ecff", want: true},
		{name: "arbitrary color", in: "#123456", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ValidNoteColor(tt.in)
			if got != tt.want {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}
