const http = require('http');

http.get('http://localhost:3000/api/subtitles/download?url=https://dl.subdl.com/subtitle/2591645', (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Success:', json.success);
      console.log('Text preview:', json.text.substring(0, 200));
    } catch(e) {
      console.log('Error parsing JSON:', e.message);
      console.log('Response:', data.substring(0, 200));
    }
  });
}).on('error', err => {
  console.log('Error:', err.message);
});
