// Налаштування сайту. Це єдиний файл сайту, який треба редагувати.
window.RESULTS_CONFIG = {
  // Адреса веб-застосунку Apps Script (закінчується на /exec).
  // Поки поле порожнє, сайт показує демо-дані з файлу demo.json.
  API_URL: "https://script.google.com/macros/s/AKfycbxbXAq9BaSu4nxH27TCGc2HZkzt7RlrWtWAle7zF20802ujhpsfMBLek1efKtXexdNF/exec",

  // Скільки верхніх рядків кожної таблиці є заголовками.
  HEADER_ROWS: 2,

  // Посилання на оплату участі (банка Monobank). Порожньо — кнопки «Оплатити участь» немає.
  PAY_URL: "https://send.monobank.ua/jar/5W1aTAunWv",

  // Локація турніру для плитки «Як доїхати» (лише в Telegram, режим «Список учасників»). Порожньо — плитки немає.
  VENUE: { name: "Krychevychy Area Fishing", lat: 49.766483, lng: 25.014995, google: "https://maps.app.goo.gl/BcJhvYt1R3XnpPLP7" },

  // Як часто сайт перевіряє, чи є нова публікація, у секундах (не менше 10).
  REFRESH_SECONDS: 15
};
