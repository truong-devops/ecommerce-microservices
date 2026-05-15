package timefmt

import "time"

const isoMillisLayout = "2006-01-02T15:04:05.000Z"

func ISO(value time.Time) string {
	return value.UTC().Format(isoMillisLayout)
}
