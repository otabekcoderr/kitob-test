import json
import re

# Read current books from data.js
with open('js/data.js', 'r', encoding='utf-8') as f:
    content = f.read()

# We need to extract the books array.
# It starts with "export const books = [" and ends with "];\n\nexport const questions = ["
books_match = re.search(r'export const books = (\[.*?\]);', content, re.DOTALL)
books_str = books_match.group(1) if books_match else ""

# Modify the questionCount for books to 5
books_str = re.sub(r"questionCount:\s*\d+", "questionCount: 5", books_str)

questions = []

# Here we define the complex questions for the books.
deep_qs = {
    'otkan-kunlar': [
        {"q": "Asarda Otabekning fojiasi faqat shaxsiy munosabatlar bilan bog'liqmi yoki davrning ijtimoiy-siyosiy inqirozi ham muhim rol o'ynaydimi?", "opts": ["Faqat shaxsiy", "Asosan siyosiy inqiroz va tarqoqlik", "Ikkalasi ham", "Faqat Zaynabning hasadi"], "ans": 2, "exp": "Otabekning fojiasi nafaqat uning sevgi uchburchagidagi holati, balki yurtning tarqoqligi va qotib qolgan an'analar fojiasidir."},
        {"q": "Yusufbek hoji obrazi orqali muallif qanday g'oyani ilgari suradi?", "opts": ["Savdogarlik sirlarini", "Xalqni birlashtirish va qon to'kilishiga qarshi kurashni", "Qo'qon xonligiga to'liq itoatni", "Oilaviy mojarolardan qochishni"], "ans": 1, "exp": "Yusufbek hoji xalqning va elning birligini, qon to'kilmasligini istagan donishmand shaxs sifatida gavdalanadi."},
        {"q": "Qipchoqlar qirg'ini epizodi asarda qanday vazifani bajaradi?", "opts": ["Asar voqealarini cho'zish uchun", "Xonlikdagi ichki nifoq va millat fojiasini ko'rsatish", "Otabekning qahramonligini ko'rsatish", "Marg'ilon tabiati tasviri"], "ans": 1, "exp": "Qipchoqlar qirg'ini xalqning o'zaro adovati qanday dahshatli fojialarga olib kelishini va yurtni zaiflashtirishini ko'rsatadi."},
        {"q": "Kumushning o'limiga sabab bo'lgan muhitning asl ildizi nimada?", "opts": ["Zaynabning yovuzligida", "O'zbek oyimning o'z xohishini o'g'liga majburlashida", "Qutidorning xatolarida", "Otabekning qat'iyatsizligida"], "ans": 1, "exp": "O'zbek oyimning Otabekni ikkinchi marta uylanishga majbur qilishi ziddiyat va fojiaga zamin yaratgan."},
        {"q": "Roman nima uchun aynan 'O'tkan kunlar' deb nomlangan?", "opts": ["Faqat tarixiy asar bo'lgani uchun", "O'tmish xatolaridan saboq chiqarish va ularni takrorlamaslik uchun", "Qahramonlarning o'tgan hayoti haqida", "Toshkent va Marg'ilon tarixi haqida"], "ans": 1, "exp": "Muallif o'tmishdagi qonli fojealar va xatolardan bugungi avlod saboq chiqarishi kerakligini nazarda tutgan."}
    ],
    'mehrobdan-chayon': [
        {"q": "Solih mahdum obrazida qanday insoniy illatlar hajv qilinadi?", "opts": ["Ziqnalik va tor dunyoqarash", "Jangovarlik va isyonkorlik", "Haddan ortiq saxiy va ishonuvchanlik", "Siyosiy hiylagarlik"], "ans": 0, "exp": "Solih mahdum o'zining ziqnaligi, maydakashligi va dunyoqarashining torligi bilan tanqid qilinadi."},
        {"q": "Anvar va Ra'no sevgisiga to'sqinlik qilgan eng katta ijtimoiy to'siq nima edi?", "opts": ["Ularning yoshligi", "Xudoyorxonning o'zboshimchalik va zulmga asoslangan tartibi", "Solih mahdumning qashshoqligi", "Sultonali mirzoning hasadi"], "ans": 1, "exp": "Xonning o'ziga yoqqan qizni istagan paytda haramiga olib ketishi mumkin bo'lgan mustabid tizimi asosiy to'siq edi."},
        {"q": "Asarda 'mehrob' va 'chayon' ramzlari nimani anglatadi?", "opts": ["Din va tabiatni", "Poklik (mehrob) timsolidagi din niqobi ostidagi yovuzlik va munofiqlik (chayon)", "Faqat saroy hayotini", "Anvar va Xudoyorxonni"], "ans": 1, "exp": "Mehrob - poklik ramzi, chayon esa yovuzlik. Xon saroyidagi din peshvolarining munofiqligi nazarda tutiladi."},
        {"q": "Sultonali mirzoning Anvar o'rniga o'zini qurbon qilishi nima ma'noni anglatadi?", "opts": ["Uning hayotdan to'yganligini", "Chin do'stlik va yuksak insoniy fidoyilikni", "Xondan qo'rqmasligini ko'rsatish", "Tasodifiy xatolik"], "ans": 1, "exp": "Sultonali do'sti Anvarning baxti va adolat uchun o'z jonini fido qilgan haqiqiy mard va sadoqatli do'st timsolidir."},
        {"q": "Ra'noning o'sha davr qizlaridan asosiy farqi nimada edi?", "opts": ["Uning juda boyligi", "O'qimishli, o'z fikriga ega va erkini himoya qila oladigan dadil qiz ekanligi", "Faqat uy ishlari bilan bandligi", "Siyosatga aralashishi"], "ans": 1, "exp": "Ra'no bilimli, ijodkor va o'z taqdiri uchun jasorat bilan kurasha oladigan erkin fikrli ayol timsolidir."}
    ],
    'sarob': [
        {"q": "Rahimjon Saidiyni qanday psixologik holat harakatga keltiradi?", "opts": ["Vatanparvarlik", "Mansabparastlik va ikkilanish, o'z yo'lini topa olmaslik", "Sof muhabbat", "Faqat boylik orttirish"], "ans": 1, "exp": "Saidiy o'zining ikkilanishlari, beqaror xarakteri va atrof-muhit ta'siriga tez tushishi tufayli tanazzulga yuz tutadi."},
        {"q": "Munisxon obrozi asarda qanday vazifani bajaradi?", "opts": ["Saidiyni boshqarish", "Saidiydagi insoniy tuyg'ularni saqlab qolishga uringan sof va fidoyi yor", "Asosiy siyosiy figura", "Salbiy qahramon"], "ans": 1, "exp": "Munisxonning pokiza sevgisi va fidoyiligi Saidiyning ma'naviy qulashiga qarshi qo'yilgan eng yorqin musbat kuchdir."},
        {"q": "Asarda 'Sarob' so'zi nimaning metaforasi hisoblanadi?", "opts": ["Cho'ldagi hodisa", "Saidiy va u ergashgan guruhlarning xomxayol, puch g'oyalari va boy berilgan umr", "Toshkent iqlimi", "Munisxonning sevgisi"], "ans": 1, "exp": "Asar nomi yosh ziyolilarning aldanishi va ishonib ergashgan g'oyalarining yolg'on, sarob ekanligiga ishoradir."},
        {"q": "Asarning tarixiy qimmati nimada?", "opts": ["Faqat tarixni hikoya qilishi", "1920-yillar O'zbekistonidagi ijtimoiy-siyosiy va ruhiy ziddiyatlarni yuksak realizm bilan ochib bergani", "Urush yillarini tasvirlashi", "Diniy qarashlarni targ'ib qilishi"], "ans": 1, "exp": "Abdulla Qahhor 20-yillarning murakkab davrini, inson ruhiyatidagi keskin o'zgarishlarni ustalik bilan tasvirlagan."},
        {"q": "Saidiyning qulashiga jamiyat aybdormi yoki uning o'zi?", "opts": ["Faqat jamiyat", "Asosan o'zining irodasizligi, prinsipial emasligi", "Faqat do'stlari", "Taqdir"], "ans": 1, "exp": "Muallif Saidiyning fojiasida uning o'z qarashlarida qat'iy emasligi va e'tiqodsizligini asosiy sabab qilib ko'rsatadi."}
    ],
    'shum-bola': [
        {"q": "Shum bola sarguzashtlari orqali yozuvchi qaysi davr illatlarini hajv qiladi?", "opts": ["Hozirgi davr", "XX asr boshlaridagi qoloqlik, nodonlik va ijtimoiy adolatsizliklar", "Qo'qon xonligi davri", "Ikkinchi jahon urushi"], "ans": 1, "exp": "Asarda inqilobdan oldingi va o'sha davrdagi jamiyatning ijtimoiy tengsizligi, boylarning xasisligi va mutaassiblik hajv qilinadi."},
        {"q": "Sariboy obrazi o'zbek adabiyotida qanday timsolga aylangan?", "opts": ["Saxiy boy", "Haddan tashqari ziqna, boylik quli bo'lgan shaxs", "Adolatli qozi", "Ma'rifatparvar ziyoli"], "ans": 1, "exp": "Sariboy o'ta xasis, hatto o'zining ehtiyojlaridan ham qizg'anuvchi ochko'z boy timsolidir."},
        {"q": "Shum bolaning hayot qiyinchiliklarini yengishidagi asosiy quroli nima?", "opts": ["Jismoniy kuchi", "Quvlik, topqirlik va hazil-mutoyiba (yumor)", "Boy do'stlari", "Qo'rqoqligi"], "ans": 1, "exp": "Bolakay o'ta og'ir sharoitlarda ham tushkunlikka tushmaydi, uning hazil tuyg'usi va aql-zakovati unga yordam beradi."},
        {"q": "Nima sababdan Shum bola doim uyidan qochishga majbur bo'ladi?", "opts": ["Sayohat qilishni yaxshi ko'rgani uchun", "Tushunmovchiliklar, onasining jazosidan qochish va erkinlikka intilish", "Boy bo'lish maqsadida", "Maktabdan qochish uchun"], "ans": 1, "exp": "U ko'pincha o'zboshimchaligi va sho'xliklari oqibatida jazolanishdan qochib, sarguzashtlar olamiga kirib ketadi."},
        {"q": "Asarning o'zbek madaniyatidagi o'rni qanday?", "opts": ["Faqat bolalar asari", "Eng sara va xalqchil yumoristik durdona", "Tarixiy darslik", "Siyosiy manifest"], "ans": 1, "exp": "Shum bola o'zining xalqchil tili va samimiy yumori bilan barcha yoshdagi o'quvchilar qalbidan chuqur joy olgan asardir."}
    ],
    'ikki-eshik-orasi': [
        {"q": "Asarda Kimsan obrazining fojiasi nima orqali ko'rsatiladi?", "opts": ["Urushdagi jarohati", "Urushdan ko'ra urushdan keyingi tuzumning tuhmatlari va shafqatsizligi", "Ra'noning xiyonati", "Boylikka o'chligi"], "ans": 1, "exp": "Kimsan frontda mardona jang qilgan bo'lsa-da, asir tushgani uchun sovet tuzumi tomonidan sotqin deya xo'rlanadi va ruhan sindiriladi."},
        {"q": "Robiyaning Kimsanga bo'lgan sevgisi qanday sinovlardan o'tadi?", "opts": ["Siyosiy ta'qiblar", "Urush, ayriliq, jamiyatning malomatlari va sadoqat sinovi", "Boylik va mansab", "Ota-onasining qarshiligi"], "ans": 1, "exp": "Robiya erini butun umr kutadi, qiyinchiliklar va umidsizliklarga qaramay sof muhabbatiga sodiq qoladi."},
        {"q": "Umar zakunchi obrazida qanday ijtimoiy illatlar ochib berilgan?", "opts": ["Mutaassiblik", "Tuhmatchilik, xudbinlik va vaziyatdan o'z manfaati yo'lida foydalanish", "Dangasalik", "Kibru havo"], "ans": 1, "exp": "Umar zakunchi vijdonni sotib, o'z manfaati uchun boshqalarni fojiaga yetaklaydigan xudbin insonlar timsolidir."},
        {"q": "Qora amma obrazi orqali o'zbek ayolining qaysi xislati ulug'lanadi?", "opts": ["Faqat uy bekasi ekanligi", "Nihoyatda mehnatkashligi, sabr-bardoshi va cheksiz onalik mehri", "Siyosatdagi faolligi", "Tadbirkorligi"], "ans": 1, "exp": "Qora amma o'zbek onalarining matonati, fidoyiligi, barakasi va kechirimliligini o'zida mujassam etgan yorqin obrazdir."},
        {"q": "Asar kompozitsiyasining (qurilishining) o'ziga xosligi nimada?", "opts": ["Bir shaxs tilidan hikoya qilinishi", "Voqealarning turli qahramonlar tilidan monolog tarzida hikoya qilinishi", "Faqat she'riy uslubda yozilgani", "Xronologik tartibning yo'qligi"], "ans": 1, "exp": "O'tkir Hoshimov asarda ko'p ovozlilik (polifoniya) uslubidan foydalanib, har bir voqeani turlicha qahramonlar nigohi orqali ko'rsatadi."}
    ],
    'dunyoning-ishlari': [
        {"q": "Onaning pulni faqat ro'zg'or va farzandlar uchun ishlatishi qanday ma'no kasb etadi?", "opts": ["Ziqnalik", "Onalik qurbonligi va farzandlar farovonligi uning uchun birinchi o'rinda ekanligi", "Tejamkorlik fanatizmi", "Ehtiyojning yo'qligi"], "ans": 1, "exp": "Ona o'ziga kerak bo'lgan paytda ham kiyim-kechak olmasdan, barcha narsani farzandlari va ruzg'origa sarflaydi."},
        {"q": "Qissadagi O'lmasjon bilan bog'liq xotira qanday insoniy tuyg'uni ifodalaydi?", "opts": ["G'araz", "Xalqimizga xos mehmondo'stlik, oqibat va qo'shnichilik munosabatlaridagi samimiyat", "Hasad", "Kibru havo"], "ans": 1, "exp": "O'lmasjon hikoyasida insonlar o'rtasidagi toza, beg'ubor va manfaatdan xoli mehr-oqibat ulug'lanadi."},
        {"q": "Muallif nega aynan 'Dunyoning ishlari' deb nomlagan?", "opts": ["Siyosat haqida bo'lgani uchun", "Tugamaydigan kundalik tashvishlar fonida onaning qadriga yetishga ulgurmaslik fojiasi", "Sayohatlar haqida", "Tadbirkorlik kitobi bo'lgani uchun"], "ans": 1, "exp": "Biz doim dunyoning ishlariga, mayda tashvishlarga chalg'ib, eng aziz insonimiz bo'lgan onalarimizga vaqt ajrata olmasligimizga ishoradir."},
        {"q": "Onaning qarz so'rab kelgan kishiga garchi o'zida bo'lmasa ham yordam berishga urinishi nimani anglatadi?", "opts": ["Odamoxunlik va keng fe'llilik, himmat", "Soddalik", "Boyligini ko'z-ko'z qilish", "Majburiyat"], "ans": 0, "exp": "Bu epizod onaning naqadar saxovatli, olijanob va boshqalar dardi bilan yashaydigan shaxs ekanligini ko'rsatadi."},
        {"q": "Asarning ruhiy ta'sir kuchi nimada?", "opts": ["Murakkab syujetida", "O'ta samimiy, hayotiy detallarga boyligi va har bir o'quvchiga o'z onasini eslatishi", "Fantastik elementlarida", "Detektiv sirlarida"], "ans": 1, "exp": "Asar haqiqiy xotiralar asosida shunday samimiy yozilganki, har bir kitobxon unda o'z onasining mehrini va xatolarini ko'radi."}
    ],
    'kecha-va-kunduz': [
        {"q": "Asarda Miryakub obrazining psixologik evrilishi qanday sodir bo'ladi?", "opts": ["Doim salbiy bo'lib qoladi", "Boylik va nafs yo'lidan asta-sekin millat va xalq g'amiga o'tishi (uyg'onish)", "Jinnilikka chalinadi", "Yurtni tark etadi"], "ans": 1, "exp": "Miryakub avvaliga johil va nafsi quli bo'lsa-da, keyinchalik jadidlar va rus ma'rifatparvari ta'sirida o'z xalqining ayanchli ahvolini tushunib yetadi."},
        {"q": "Akbarali mingboshi obrazi qanday qatlam vakili?", "opts": ["Jadidlar", "Xalqparvar rahbar", "Chor imperiyasiga ko'r-ko'rona xizmat qiluvchi johil, maishatboz amaldor", "Ziyoli qatlam"], "ans": 2, "exp": "Akbarali mingboshi o'z xalqini ezuvchi, qoloq, maishat va mansabga berilgan mahalliy amaldorlarning tipik vakilidir."},
        {"q": "Zebi qanday muhit qurboni bo'ladi?", "opts": ["Faqat mingboshining zolimligi", "Jaholat, mutaassib ota va ayollarning huquqsizligi", "O'zining xudbinligi", "Siyosiy inqilob"], "ans": 1, "exp": "Zebi ajoyib, iste'dodli qiz bo'lishiga qaramay, otasining pul tamagirligi va jamiyatdagi mutaassiblik qurboni bo'lib, fojiali qismatga yuz tutadi."},
        {"q": "Cho'lponning ushbu romanidagi til va uslubining o'ziga xosligi nimada?", "opts": ["Faqat tarixiy dalillar keltirishi", "O'ta nozik lirik chekinishlar, o'zbek tilining boy va go'zal ifoda vositalaridan mahorat bilan foydalanishi", "Faqat she'riy uslubda yozilganligi", "Ko'plab chet tili so'zlarini qo'shishi"], "ans": 1, "exp": "Cho'lpon kuchli shoir bo'lgani uchun romanning tili nihoyatda go'zal, jozibali, lirik va poetik bo'yoqlarga boy."},
        {"q": "Romanning 'Kunduz' qismi nima uchun yozilmagan (yoki saqlanib qolmagan)?", "opts": ["Muallif vafot etgani uchun", "Cho'lpon Stalin qatag'oni qurboni bo'lgani va uning asarlari yo'q qilingani tufayli", "Muallif fikridan qaytgan", "Yozishga ulgurmagan"], "ans": 1, "exp": "Cho'lpon qatag'on qurboni bo'lgan, asarning 'Kunduz' qismi yo yo'q qilingan, yo oxirigacha yozilmagan degan taxminlar bor."}
    ],
    'ulugbek-xazinasi': [
        {"q": "Mirzo Ulug'bek hayotidagi eng katta ichki kurash qaysi hislar o'rtasida kechadi?", "opts": ["Savdo va dehqonchilik", "Ilim-ma'rifat (astronomiya) va davlat boshqaruvi mas'uliyati", "Urush va tinchlik", "Boylik va qashshoqlik"], "ans": 1, "exp": "Ulug'bek ulug' olim bo'lsa-da, davlat boshqarishga majbur edi. Uning qalbida ilmu fanga ishtiyoq va podshohlik burchi to'qnashadi."},
        {"q": "Abulatif (padarkush) obrazida qanday ijtimoiy-psixologik muammo ko'tarilgan?", "opts": ["Qo'rqoqlik", "Hokimiyat va taxt ilinjida insoniy qiyofani, hatto farzandlik burchini yo'qotish fojiasi", "Mehnatkashlik", "Din ishtiyoqi"], "ans": 1, "exp": "Abulatif taxtga erishish ilinjida o'z otasining qotiliga aylanadi, bu hokimiyat jinniligining cho'qqisi sifatida ko'rsatilgan."},
        {"q": "Asarda 'Ulug'bek xazinasi' deganda, birinchi navbatda, nima nazarda tutilgan?", "opts": ["Oltin tangalar va javohirlar", "Uning noyob kutubxonasi va yozib qoldirgan ilmiy merosi (Ziji ko'ragoniy)", "Saraydagi qurol-yarog'lar", "Xuroson yerlari"], "ans": 1, "exp": "Romandagi haqiqiy xazina bu kitoblar va Ulug'bekning ilmiy merosidir, ularni saqlab qolish yo'lidagi kurash asar markazida turadi."},
        {"q": "Xo'ja Ahror Valiy obrazi Ulug'bekka qanday munosabatda ko'rsatiladi?", "opts": ["To'liq qo'llab-quvvatlovchi", "Diniy mutaassiblik va muxolifat timsoli, ilm-fanga qarshi kuch", "Eng yaqin shogirdi", "Betaraf"], "ans": 1, "exp": "Asarda Xo'ja Ahror Valiy Ulug'bekning ilmiy yo'nalishlariga qarshi chiqqan keskin siyosiy-diniy opponent sifatida gavdalanadi."},
        {"q": "Ali Qushchining fojia fonidagi o'rni qanday?", "opts": ["Xoin", "Ulug'bek ishini davom ettirgan sodiq shogird va ilm mash'alasini saqlab qolgan inson", "Tijoratchi", "Siyosatchi"], "ans": 1, "exp": "Ali Qushchi ustozining o'limidan so'ng uning xazinasini (ilmiy merosini) olib, uni kelajak avlodga yetkazish vazifasini bajaradi."}
    ],
    'yulduzli-tunlar': [
        {"q": "Boburning Samarqandni qayta-qayta zabt etishga urinishi nimadan dalolat beradi?", "opts": ["Ochko'zlik", "Uning Temuriylar davlatini qayta tiklashga va qadimgi poytaxtni saqlab qolishga bo'lgan buyuk orzusi", "Shayboniyxonga dushmanligi", "Sayohat ishtiyoqi"], "ans": 1, "exp": "Bobur butun umri davomida o'z ota-bobolari yurti bo'lgan Movarounnahrni yagona markazlashgan davlat qilish orzusida bo'lgan."},
        {"q": "Asarda Shayboniyxon qanday shaxs sifatida tasvirlanadi?", "opts": ["Ahmoq sarkarda", "O'z maqsadiga erishish yo'lida hech narsadan tap tortmaydigan ayyor, shafqatsiz, ammo kuchli strateg", "Faqat diniy rahbar", "Sodda dehqon"], "ans": 1, "exp": "Shayboniyxon Boburning asosiy raqibi bo'lib, juda kuchli siyosatchi, ayyor va shafqatsiz dushman sifatida gavdalantirilgan."},
        {"q": "Boburning ruhiy azoblari asosan nima bilan bog'liq?", "opts": ["Kasalik", "Vatan sog'inchi va o'z yurtidan olisda o'zga elni idora qilishga majburligi", "Boylikning yetishmasligi", "Farzandlarining yo'qligi"], "ans": 1, "exp": "Bobur Hindistonda ulug' imperiya qursa-da, uning qalbi doim Andijon va Movarounnahrni qumsab, vatan sog'inchida iztirob chekadi."},
        {"q": "Xonzodabegim taqdiri o'sha davrdagi qanday ayanchli haqiqatni ko'rsatadi?", "opts": ["Ayollarning hukmdor bo'lishini", "Siyosiy o'yinlar va tinchlik shartnomalari qurboniga aylanuvchi ayollar fojiasini", "Hindistondagi qiyinchiliklarni", "Sirog'dagi hayotni"], "ans": 1, "exp": "Bobur va o'z oilasi jonini saqlab qolish uchun Xonzodabegim ixtiyorsiz ravishda Shayboniyxonga nikohlanishga majbur bo'ladi."},
        {"q": "Roman nima uchun aynan 'Yulduzli tunlar' deb nomlangan?", "opts": ["Astronomiya kitobi", "Boburning tunda yulduzlarga qarab yurtini eslashi va ruhiy mushohadalari timsoli", "Urush tunda bo'lgani uchun", "Hindiston tunlari go'zalligi"], "ans": 1, "exp": "Vatansiz qolgan shoh tunda yulduzlarga qarab taskin izlaydi, o'zining dardlari va ijodini o'sha yulduzli tunlarda qog'ozga tushiradi."}
    ],
    'qorqma': [
        {"q": "Asarning asosiy g'oyasi nima?", "opts": ["Sayohat va ta'lim", "Millat uyg'onishi uchun qurbon bo'lgan jadidlar merosini unutmaslik va ruhiy qullikdan qutulish", "Iqtisodiy inqiroz", "Sevgi hikoyasi"], "ans": 1, "exp": "Javlon Jovliyevning bu asari talabalarni va yoshlarni o'tmishdagi jadid bobolarimiz singari ilm orqali millatni qutqarishga chaqiradi."},
        {"q": "1920-yillarda Germaniyaga ketgan talabalar taqdiri qanday yakun topadi?", "opts": ["Hammasi katta olim bo'ladi", "Deyarli barchasi Vataniga qaytgach, sovet tuzumi tomonidan 'xalq dushmani' sifatida otib tashlanadi", "Germaniyada qolib ketadi", "Boy-badavlat yashaydi"], "ans": 1, "exp": "Stalin qatag'onlari davrida xorijda ta'lim olgan bu yoshlarning deyarli barchasi vatan xaini degan tuhmat bilan yo'q qilingan."},
        {"q": "Asardagi 'Qo'rqma' xitobi kimga va nima maqsadda qaratilgan?", "opts": ["Tarixchilarga", "Bugungi kun yoshlariga: o'z fikrini aytishdan, millat uchun xizmat qilishdan va harakat qilishdan qo'rqmaslikka", "Faqat asar qahramonlariga", "Siyosatchilarga"], "ans": 1, "exp": "Muallif yoshlarni letargiya va befarqlikdan uyg'otish uchun bu xitobni asarning bosh leytmotivi qilib olgan."},
        {"q": "Jadidlarning eng katta maqsadi nima edi?", "opts": ["Boylik orttirish", "Yevropa ilm-fanini O'zbekistonga olib kelib, xalqning ko'zini ochish va ozodlikka erishish", "Chet elga ko'chib ketish", "Diniy mutaassiblikni yoyish"], "ans": 1, "exp": "Jadidlar millatni faqatgina ta'lim, fan va ochiq dunyoqarash orqaligina mustamlaka iskanjasidan qutqarish mumkin deb hisoblashgan."},
        {"q": "Asarda parallel ravishda qaysi davrlar tasvirlanadi?", "opts": ["Faqat 1920-yillar", "1920-yillardagi jadidlar davri va bugungi kunda o'z yo'lini qidirayotgan talaba hayoti", "18-asr va 20-asr", "Urush davri va hozir"], "ans": 1, "exp": "Romanda o'tmish fojiasi va hozirgi talaba hayotidagi muammolar parallel tarzda, bir-birini to'ldirgan holda ochib beriladi."}
    ],
    'atom-odatlar': [
        {"q": "Asarning asosiy falsafasi qaysi qoidaga asoslangan?", "opts": ["Faqat katta maqsadlar qo'yish", "Maqsadlarga emas, balki ularga olib boruvchi kichik tizim va odatlarga diqqat qilish", "Faqat motivatsiyaga tayanish", "Pul ishlash strategiyasi"], "ans": 1, "exp": "Jeyms Klir tizimlar maqsadlardan ko'ra muhimroq ekanligini, 1% lik ijobiy o'zgarishlar vaqt o'tishi bilan katta natija berishini uqtiradi."},
        {"q": "Nima uchun muallif maqsad qo'yishdan ko'ra o'zlikni anglashni muhim deydi?", "opts": ["Maqsadlar ishlamaydi", "Odatlar shaxsning kim bo'lishni xohlashi (identitet) bilan bog'langandagina mustahkam bo'ladi", "Vaqtni tejaydi", "Osonroq bo'lgani uchun"], "ans": 1, "exp": "'Men kitob o'qishni xohlayman' deyish o'rniga 'Men kitobxonman' degan e'tiqod odatning qolishini kafolatlaydi."},
        {"q": "Odat shakllanishining to'rt qadami (Sikl) to'g'ri ko'rsatilgan qator qaysi?", "opts": ["Fikr, istak, reja, natija", "Turtki (Cue), Talab (Craving), Reaksiya (Response), Mukofot (Reward)", "Maqsad, iroda, ish, baho", "Motivatsiya, harakat, intizom, muvaffaqiyat"], "ans": 1, "exp": "Miya yangi odatni qabul qilishi uchun aynan shu to'rt bosqichdan o'tishi psixologik jihatdan isbotlangan."},
        {"q": "Yaxshi odatni shakllantirish uchun muhitning roli qanday?", "opts": ["Umuman rol o'ynamaydi", "Irodaga tayanib muhitni e'tiborsiz qoldirish kerak", "Muhitni to'g'ri tashkil qilish kuchli irodadan ko'ra samaraliroqdir (masalan, zararli narsalarni ko'zdan uzoqlashtirish)", "Faqat ofisda muhim"], "ans": 2, "exp": "Inson irodasi tugaydigan resursdir, shuning uchun atrofdagi muhit odatni oson yoki qiyin qilishga moslashtirilishi zarur."},
        {"q": "Yomon odatdan xalos bo'lishning eng samarali yo'llaridan biri asarda qanday tushuntiriladi?", "opts": ["O'z-o'zini jazolash", "Uni ko'zga ko'rinmas (qiyin) va noqulay qilish", "Faqat harakat qilishni to'xtatish", "Boshqalarga so'z berish"], "ans": 1, "exp": "Agar yomon odatni amalga oshirish jarayonini iloji boricha murakkablashtirsangiz, uni tashlash osonlashadi."}
    ]
}

# The books that don't have deep_qs defined will get a generic set of deep questions based on their genre
generic_qs = [
    {"q": "Ushbu asarning asosiy qahramoni orqali muallif qanday falsafiy g'oyani ilgari surgan?", "opts": ["Inson va tabiat munosabati", "Insonning o'z ustidan g'alaba qozonishi va ruhiy kamoloti", "Faqat moddiy boylikka intilish fojiasi", "Siyosiy inqiloblarning ahamiyati"], "ans": 1, "exp": "Aksariyat durdona asarlarning markazida insonning ruhiy evrilishi va o'zligini topish yo'lidagi kurashi yotadi."},
    {"q": "Asar yozilgan davrdagi qaysi tarixiy yoki ijtimoiy jarayon asar syujetiga kuchli ta'sir o'tkazgan?", "opts": ["Sanoat inqilobi", "Jamiyatdagi tabaqalanish, huquqsizlik va ma'naviy tanazzul", "Iqlim o'zgarishi", "Kosmosni zabt etish"], "ans": 1, "exp": "Har qanday buyuk asar o'z davrining oyna bo'lib, ijtimoiy adolatsizliklarni ifoda etadi."},
    {"q": "Syujet rivojidagi eng muhim burilish nuqtasi (kulminatsiya) qaysi hissiyotga asoslangan?", "opts": ["Qo'rquv va qasos", "Ichki vijdon qiynog'i va hayotiy tanlov", "Faqat xursandchilik", "Zerikish"], "ans": 1, "exp": "Qahramon o'z qadriyatlari o'rtasida murakkab tanlov qilishga majbur bo'lgan payt asarning eng yuqori nuqtasidir."},
    {"q": "Asardagi salbiy obrazlarning (antagonist) xatti-harakatini psixologik jihatdan qanday oqlash yoki izohlash mumkin?", "opts": ["Ular tug'ma yovuz", "Ularning harakatlari davr tuzumi, nafs va johillik mahsulidir", "Ularning maqsadi yo'q", "Faqat yozuvchining xohishi"], "ans": 1, "exp": "Salbiy qahramonlar ko'pincha jamiyatdagi qabih tuzum va odamlardagi ochko'zlik qurbonlari bo'lib shakllanadi."},
    {"q": "Bu asarning hozirgi zamon kitobxoni uchun ahamiyati nimada?", "opts": ["Faqat tarixni bilish", "Inson tabiati o'zgarmasligi va asardagi ma'naviy muammolarning bugun ham dolzarbligi", "Vaqtni o'tkazish", "Eski tillarni o'rganish"], "ans": 1, "exp": "Klassik va yetakchi asarlar zamon tanlamaydi, ular doim insoniyatning ruhiy dardlariga malham va saboq bo'ladi."}
]

out_questions = []

import ast
# To parse the books string, we can use a quick regex approach since it's just JS object representation.
# Let's extract book ids.
ids = re.findall(r"id:\s*'([^']+)'", books_str)

q_id_counter = 1
for book_id in ids:
    if book_id in deep_qs:
        qs = deep_qs[book_id]
        for idx, q in enumerate(qs):
            out_questions.append({
                "id": f"q-{book_id}-{idx+1}",
                "bookId": book_id,
                "question": q["q"],
                "options": q["opts"],
                "correctAnswer": q["ans"],
                "explanation": q["exp"]
            })
    else:
        for idx, q in enumerate(generic_qs):
            out_questions.append({
                "id": f"q-{book_id}-{idx+1}",
                "bookId": book_id,
                "question": q["q"],
                "options": q["opts"],
                "correctAnswer": q["ans"],
                "explanation": q["exp"]
            })

# Format questions array to JS string
qs_js = "export const questions = [\n"
for q in out_questions:
    qs_js += f"""  {{
    id: '{q['id']}',
    bookId: '{q['bookId']}',
    question: {json.dumps(q['question'], ensure_ascii=False)},
    options: {json.dumps(q['options'], ensure_ascii=False)},
    correctAnswer: {q['correctAnswer']},
    explanation: {json.dumps(q['explanation'], ensure_ascii=False)}
  }},
"""
qs_js += "];\n"

with open('js/data.js', 'w', encoding='utf-8') as f:
    f.write(f"export const books = {books_str};\n\n{qs_js}")

print("Successfully updated data.js with complex questions!")
