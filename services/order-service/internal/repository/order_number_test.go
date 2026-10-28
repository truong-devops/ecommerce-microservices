package repository

import "testing"

func TestFormatGeneratedOrderNumber(t *testing.T) {
	tests := []struct {
		name     string
		sequence int64
		want     string
		wantErr  bool
	}{
		{name: "first", sequence: 1, want: "EMX0000001"},
		{name: "keeps seven digits", sequence: 6_000_003, want: "EMX6000003"},
		{name: "last supported", sequence: 9_999_999, want: "EMX9999999"},
		{name: "zero rejected", sequence: 0, wantErr: true},
		{name: "overflow rejected", sequence: 10_000_000, wantErr: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := formatGeneratedOrderNumber(test.sequence)
			if (err != nil) != test.wantErr {
				t.Fatalf("formatGeneratedOrderNumber() error = %v, wantErr %v", err, test.wantErr)
			}
			if got != test.want {
				t.Fatalf("formatGeneratedOrderNumber() = %q, want %q", got, test.want)
			}
		})
	}
}
