# TESTING.md

## Testing Philosophy

Tests should prioritize:

1. Correctness
2. Readability
3. Coverage of edge cases
4. Ease of debugging

Avoid overly complex test setups.

## Test Structure

Prefer table-driven tests when appropriate.

Example:

```go
func TestCalculate(t *testing.T) {
	tests := []struct {
		name string
		input int
		want int
	}{
		{
			name: "positive number",
			input: 2,
			want: 4,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Calculate(tt.input)

			if got != tt.want {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}
```
