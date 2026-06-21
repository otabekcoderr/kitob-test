const Q = (question, options, correctAnswer, explanation) => ({ question, options, correctAnswer, explanation });

const bookQuestions = {
  hamlet: [
    Q('"Hamlet" tragediyasida qirol Klavdiy Hamletga nisbatan kim bo\'ladi?', ['Amakisi', 'Otasi', 'Akasi', 'Buvasi'], 0, 'Klavdiy Hamletning amakisi bo\'lib, u Hamletning otasini o\'ldirib, taxt va qirolichaga ega chiqadi.'),
    Q('Hamlet mashhur "Yoki bo\'lmoq, yoki bo\'lmaslik" monologini qayerda aytadi?', ['Qasr devorida', 'Qabristonda', 'Saroy zalida', 'Onasining xonasida'], 1, 'Hamlet bu monologni qabristonda, bosh suyagiga qarab hayot va o\'lim haqida mulohaza yuritayotganda aytadi.'),
    Q('Hamlet sevgan qiz Poloniyning qizi kim edi?', ['Ofeliya', 'Gertruda', 'Yorik', 'Yuliy'], 0, 'Ofeliya - Poloniyning qizi va Hamletning sevgilisi. U Hamletning aqldan ozganligi va otasining o\'limidan keyin aqldan ozadi.'),
    Q('Hamlet asarida "spektakl ichida spektakl" sahnasining maqsadi nima?', ['Shohona tomosha qilish', 'Klavdiyning aybini fosh etish', 'Ofeliyani sevish', 'Aqldan ozganlikni ko\'rsatish'], 1, 'Hamlet aktyorlar yordamida otasining o\'ldirilishi sahnalashtirilgan spektaklni qo\'yib, Klavdiyning reaksiyasini kuzatadi.'),
    Q('Hamletning eng yaqin do\'sti va ishonchli maslahatchisi kim edi?', ['Rozenkrans', 'Gildenstern', 'Horatsiy', 'Laert'], 2, 'Horatsiy Hamletning eng sodiq do\'sti bo\'lib, u asar oxirida tirik qoladi va voqeani hikoya qiladi.'),
    Q('"Hamlet" tragediyasining asosiy mavzusi nima?', ['Sevgi va sadoqat', 'Qasos va ikkilanish', 'Boylik va hokimiyat', 'Do\'stlik va xiyonat'], 1, 'Asarning asosiy mavzusi - qasos va ikkilanish, Hamlet otasining o\'limi uchun qasos olishda doimiy ikkilanadi.'),
    Q('Ofeliyaning o\'limi qanday tasvirlanadi?', ['Qilich bilan o\'ldiriladi', 'Zahar ichadi', 'Daryoga cho\'kib ketadi', 'Saroy devoridan yiqiladi'], 2, 'Ofeliya aqldan ozgan holda daryo bo\'yida gulchambarlar to\'qib yurganida, shox sinib, suvga tushib cho\'kadi.'),
    Q('Hamlet otasining sharpasini birinchi marta qayerda ko\'radi?', ['Saroyda', 'Qasr devori ustida', 'Qabristonda', 'O\'rmonda'], 1, 'Qirolning sharpasi birinchi marta qasr devori ustida, tungi soqchilarga ko\'rinadi.'),
    Q('Qirolicha Gertruda kimga turmushga chiqadi?', ['Hamletning otasiga', 'Klavdiyga', 'Poloniyga', 'Laertga'], 1, 'Gertruda - Hamletning onasi, eri vafot etgach, uning ukasi Klavdiyga turmushga chiqadi.'),
    Q('Asar oxirida qanday voqea yuz beradi?', ['Hamlet qirol bo\'ladi', 'Hamlet va uning dushmanlari halok bo\'ladi', 'Hamlet Ofeliyaga uylanadi', 'Hamlet Angliyaga ketadi'], 1, 'Asar oxirida qilichboslik paytida zaharli qilich va sharob tufayli Gertruda, Laert, Klavdiy va Hamletning o\'zi ham halok bo\'ladi.'),
  ],
};

const outputLines = ['['];
let isFirst = true;
for (const [bookId, questions] of Object.entries(bookQuestions)) {
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const prefix = isFirst ? '' : ',';
    isFirst = false;
    outputLines.push(`${prefix}\n  {`);
    outputLines.push(`    id: 'q-${bookId}-${i+1}',`);
    outputLines.push(`    bookId: '${bookId}',`);
    outputLines.push(`    question: '${q.question.replace(/'/g, "\\'")}',`);
    outputLines.push(`    options: [${q.options.map(o => `'${o.replace(/'/g, "\\'")}'`).join(', ')}],`);
    outputLines.push(`    correctAnswer: ${q.correctAnswer},`);
    outputLines.push(`    explanation: '${q.explanation.replace(/'/g, "\\'")}'`);
    outputLines.push('  }');
  }
}
outputLines.push('\n]');
require('fs').writeFileSync('C:\\Users\\Hp\\.gemini\\antigravity\\scratch\\kitob-test\\scratch\\generated-output.js', outputLines.join(''), 'utf8');
console.log('Done');
