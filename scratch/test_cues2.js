const fs = require('fs');

function parseVttCues(vttText) {
  const cues = [];
  if (!vttText) return cues;

  const normalized = vttText.replace(/\r\n|\r/g, '\n');

  const parseSeconds = (t) => {
    const cleanTime = t.trim().split(/\s+/)[0]; // strip any WebVTT cue settings
    const parts = cleanTime.split(':');
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2].replace(',', '.'));
    } else if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1].replace(',', '.'));
    }
    return parseFloat(cleanTime.replace(',', '.')) || 0;
  };

  const blocks = normalized.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx === -1) continue;

    const [startStr, endStr] = lines[timeIdx].split('-->');
    if (startStr && endStr) {
      const start = parseSeconds(startStr);
      const end = parseSeconds(endStr);
      const textLines = lines.slice(timeIdx + 1);
      const text = textLines.join('\n');

      if (text && !isNaN(start) && !isNaN(end) && end > start) {
        cues.push({ start, end, text });
      } else {
          console.log("Invalid cue:", { startStr, endStr, start, end, text });
      }
    }
  }

  return cues;
}

const sampleVtt = `WEBVTT

1
00:00:01.000 --> 00:00:03.500
Hello World!

2
00:00:04,500 --> 00:00:06,000
Second subtitle
with two lines

3
00:00:07.500 --> 00:00:09.000 align:middle line:90%
Third with settings
`;

const cues = parseVttCues(sampleVtt);
console.log(cues);
