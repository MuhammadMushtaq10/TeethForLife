require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Teeth For Life API running on http://localhost:${PORT}`);
});
