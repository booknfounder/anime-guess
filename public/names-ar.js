'use strict';
/*
  قاموس الأسماء العربية للشخصيات.
  الصيغة لكل سطر:  الاسم الإنجليزي (ويمكن عدة صيغ بينها /) | الاسم العربي الأساسي | أسماء بديلة مقبولة (بينها فاصلة)
  لإضافة شخصية: أضف سطراً جديداً في القسم المناسب بنفس الصيغة (الاسم الإنجليزي كما يظهر في AniList).
*/

/* ── أدوات تطبيع النص (عربي + إنجليزي) ── */
const strip = s => String(s).toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f\u064B-\u065F\u0670\u0640]/g, '').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
const norm = s => strip(s).replace(/[^a-z0-9\u0621-\u064A]/g, '');
const words = s => strip(s).split(/[^a-z0-9\u0621-\u064A]+/).filter(Boolean);
const sortedKey = s => words(s).sort().join('');

const DATA = {
  naruto: `
Naruto Uzumaki|ناروتو أوزوماكي|ناروتو
Sasuke Uchiha|ساسكي أوتشيها|ساسكي,ساسوكي
Sakura Haruno|ساكورا هارونو|ساكورا
Kakashi Hatake|كاكاشي هاتاكي|كاكاشي
Itachi Uchiha|إيتاشي أوتشيها|إيتاشي,إيتاتشي
Gaara|غارا|جارا
Jiraiya|جيرايا|جيرايا
Madara Uchiha|مادارا أوتشيها|مادارا
Minato Namikaze|ميناتو نامكازي|ميناتو
Hinata Hyuuga|هيناتا هيوغا|هيناتا
Rock Lee|روك لي|لي
Shikamaru Nara|شيكامارو نارا|شيكامارو
Obito Uchiha|أوبيتو أوتشيها|أوبيتو
Neji Hyuuga|نيجي هيوغا|نيجي
Tsunade|تسونادي|تسوناده,تسونادا
Orochimaru|أوروتشيمارو|أوروتشيمارو
Pain/Pein|باين|بين
Nagato|ناغاتو|ناجاتو
Konan|كونان
Kurama|كوراما|كيوبي
Might Guy/Maito Gai|مايت غاي|غاي
Hashirama Senju|هاشيراما سينجو|هاشيراما
Tobirama Senju|توبيراما سينجو|توبيراما
Deidara|ديدارا
Sasori|ساسوري
Kisame Hoshigaki|كيسامي هوشيغاكي|كيسامي
Hidan|هيدان
Kakuzu|كاكوزو
Zetsu|زيتسو
Tenten|تين تين
Ino Yamanaka|إينو ياماناكا|إينو
Choji Akimichi|تشوجي أكيميتشي|تشوجي
Kiba Inuzuka|كيبا إينوزوكا|كيبا
Shino Aburame|شينو أبورامي|شينو
Temari|تيماري
Kankuro|كانكورو
Killer Bee/Killer B|كيلر بي
Kushina Uzumaki|كوشينا أوزوماكي|كوشينا
Hiruzen Sarutobi|هيروزن ساروتوبي|هيروزن
Iruka Umino|إيروكا أومينو|إيروكا
Kabuto Yakushi|كابوتو ياكوشي|كابوتو
Zabuza Momochi|زابوزا مومتشي|زابوزا
Haku|هاكو
Boruto Uzumaki|بوروتو أوزوماكي|بوروتو
Mitsuki|ميتسوكي
Sarada Uchiha|ساردا أوتشيها|ساردا
Asuma Sarutobi|أسوما ساروتوبي|أسوما
Anko Mitarashi|أنكو ميتاراشي|أنكو
Yamato|ياماتو
Konohamaru Sarutobi|كونوهامارو ساروتوبي|كونوهامارو
Danzo Shimura/Danzou Shimura|دانزو شيمورا|دانزو
Onoki|أونوكي
Mei Terumi|ماي تيرومي
Kaguya Otsutsuki|كاغويا أوتسوتسوكي|كاغويا
Shisui Uchiha|شيسوي أوتشيها|شيسوي
Rin Nohara|رين نوهارا
Karin|كارين
Jugo|جوغو
Suigetsu Hozuki|سويغتسو هوزوكي|سويغتسو
Sai|ساي
Hanzo|هانزو`,

  dbz: `
Son Goku/Goku Son/Goku/Kakarot|غوكو|جوكو,غوكو,Goku
Vegeta|فيجيتا|فيجيتا,فيجتا
Son Gohan/Gohan Son/Gohan|غوهان|جوهان
Piccolo|بيكولو
Trunks/Future Trunks|ترانكس|ترنكس
Frieza|فريزا|فريزر
Cell|سيل
Majin Buu/Buu|ماجن بو|بو
Krillin/Kuririn|كورلين|كريلين
Bulma/Bulma Briefs|بولما|بلوما
Goten/Son Goten|غوتن|جوتن
Android 18|أندرويد 18|الأندرويد 18
Videl|فيدل
Chi-Chi/Chichi|تشي تشي
Yamcha|يامشا
Tien Shinhan/Tenshinhan|تين شين هان
Chiaotzu|تشاوتسو
Master Roshi/Kame Sennin|السيد روشي|ماستر روشي,روشي
Nappa|نابا
Raditz|رادتز
Gotenks|غوتينكس
Vegito|فيجيتو
Gogeta|غوجيتا
Mr. Satan/Hercule|هيركيول|ساتان,ميستر ساتان
Dende|دندي
Kami/Kami-sama|كامي
King Kai|الملك كاي
Android 17|أندرويد 17|الأندرويد 17
Android 16|أندرويد 16|الأندرويد 16
Dr. Gero/Doctor Gero|الدكتور غيرو|غيرو
Captain Ginyu/Ginyu|القبطان غينيو|غينيو
Zarbon|زاربون
Dodoria|دودوريا
Bardock|باردوك
Broly|بروللي|برولي
Cooler|كولر
Mr. Popo|السيد بوبو|بوبو
Oolong|أولونغ
Puar|بوار
Shenron|شينرون
Pan|بان`,

  dbs: `
Beerus/Bills|بيروس
Whis|ويس
Jiren|جيرين
Hit|هيت
Goku Black|غوكو بلاك
Zamasu|زاماسو
Toppo|توبو
Kefla|كيفلا
Caulifla|كاوليفلا
Kale|كالي
Vados|فادوس
Champa|تشامبا
Frost|فروست
Cabba|كابا
Dyspo|ديسبو
Zeno/Zen'oh|زينو
Grand Priest|الكاهن الأكبر`,

  onepiece: `
Monkey D. Luffy/Luffy Monkey D.|مونكي دي لوفي|لوفي
Roronoa Zoro/Zoro Roronoa|رورونوا زورو|زورو
Nami|نامي
Usopp|أوسوب|أوسب,يوسب,اوسوب
Sanji/Vinsmoke Sanji|سانجي
Tony Tony Chopper|توني توني تشوبر|تشوبر
Nico Robin|نيكو روبن|روبين,روبن
Franky|فرانكي
Brook|بروك
Jinbe/Jinbei|جينبي
Portgas D. Ace/Ace|بورتغاس دي إيس|إيس,ايس
Sabo|سابو
Trafalgar Law/Trafalgar D. Water Law|ترافالغار لو|لو
Shanks|شانكس
Eustass Kid/Eustass Kidd|يوستاس كيد|كيد
Boa Hancock|بوا هانكوك|هانكوك
Dracule Mihawk|دراكول ميهوك|ميهوك
Edward Newgate/Whitebeard|إدوارد نيوغيت|وايت بيرد
Gol D. Roger|غول دي روجر|روجر
Kaido|كايدو
Charlotte Katakuri|شارلوت كاتاكوري|كاتاكوري
Charlotte Linlin/Big Mom|شارلوت لينلين|بيغ مام
Marshall D. Teach/Blackbeard|مارشال دي تيتش|بلاك بيرد
Marco|ماركو
Donquixote Doflamingo|دونكيشوت دوفلامينغو|دوفلامينغو
Crocodile|كروكودايل
Smoker|سموكر
Sakazuki/Akainu|ساكازوكي|أكاينو,اكاينو
Kuzan/Aokiji|كوزان|أوكيجي,اوكيجي
Borsalino/Kizaru|بورساليرو|كيزارو
Monkey D. Garp|مونكي دي غارب|غارب
Sengoku|سينغوكو
Rob Lucci|روب لوتشي|لوتشي
Nefertari Vivi|نفرتاري فيفي|فيفي
Yamato|ياماتو
Perona|بيرونا
Buggy|باغي
Arlong|أرلونغ
Enel|إينيل
Gecko Moria|غيكو موريا|موريا
Bartholomew Kuma|بارثولوميو كوما|كوما
Monkey D. Dragon|مونكي دي دراغون|دراغون
Silvers Rayleigh|سيلفرز رايلي|رايلي
Koby|كوبي
Zeff|زيف
Bon Clay/Bon Kurei|بون كلاي
Kozuki Oden|كوزوكي أودين|أودين
Carrot|كاروت
Bartolomeo|بارتولوميو`,

  bleach: `
Ichigo Kurosaki|إيتشيغو كوروساكي|إيتشيغو
Rukia Kuchiki|روكيا كوتشيكي|روكيا
Orihime Inoue|أوريهيمي إينوي|أوريهيمي
Uryu Ishida/Uryuu Ishida|أوريو إيشيدا|أوريو
Yasutora Sado/Chad|ياسوتورا سادو|تشاد
Byakuya Kuchiki|بياكويا كوتشيكي|بياكويا
Kenpachi Zaraki|كينباتشي زاراكي|كينباتشي
Toshiro Hitsugaya/Toushirou Hitsugaya|توشيرو هيتسوغايا|توشيرو
Sosuke Aizen/Sousuke Aizen|سوسكي أيزن|أيزن
Renji Abarai|رينجي أباراي|رينجي
Grimmjow Jaegerjaquez|غريمجو جاغرجاك|غريمجو
Ulquiorra Cifer/Ulquiorra Schiffer|أولكيورا سيفر|أولكيورا
Gin Ichimaru|غين إيتشيمارو|غين
Kisuke Urahara|كيسكي أوراهارا|كيسكي
Yoruichi Shihoin/Yoruichi Shihouin|يورويتشي شيهوين|يورويتشي
Shunsui Kyoraku|شونسوي كيوراكو|شونسوي
Jushiro Ukitake/Juushirou Ukitake|جوشيرو أوكيتاكي|جوشيرو
Genryusai Shigekuni Yamamoto/Genryuusai Yamamoto|يامامواتو|يامامواتو
Soi Fon/Suì-Fēng|سوي فون
Mayuri Kurotsuchi|مايوري كوروتسوتشي|مايوري
Retsu Unohana|ريتسو أونوهانا|أونوهانا
Isshin Kurosaki|إيشين كوروساكي|إيشين
Tier Harribel|تيير هاريبل|هاريبل
Coyote Starrk/Starrk|ستارك
Nelliel Tu Odelschwanck/Nelliel|نيليل
Kaname Tosen|كانامي توسن|توسن
Sajin Komamura|ساجين كوماموره|كوماموره
Rangiku Matsumoto|رانغيكو ماتسوموتو|رانغيكو
Momo Hinamori|مومو هيناموري|مومو
Ikkaku Madarame|إيكاكو مادارامي|إيكاكو
Yumichika Ayasegawa|يوميتشيكا أياسيغاوا|يوميتشيكا
Shinji Hirako|شينجي هيراكو|شينجي
Yhwach|يهواخ
Kon|كون
Nnoitra Gilga|نويترا جيلغا|نويترا
Szayelaporro Granz|سزايلابورو غرانز|سزايلابورو
Hiyori Sarugaki|هيوري ساروغاكي|هيوري
Mashiro Kuna|ماشيرو كونا|ماشيرو
Lisa Yadomaru|ليزا يادومارو|ليزا`,
};

/* ── بناء الفهرس ── */
const byKey = new Map();        // مفتاح مُطبَّع -> سجل
const partFreq = new Map();     // كلمة -> عدد الشخصيات التي تحويها (لتجنب قبول اللقب المشترك مثل "أوتشيها")
for (const block of Object.values(DATA)) {
  for (const line of block.split('\n')) {
    const t = line.trim(); if (!t) continue;
    const [en, ar, al] = t.split('|');
    if (!ar) continue;
    const entry = { en: en.split('/').map(s => s.trim()), ar: ar.trim(), aliases: (al || '').split(',').map(s => s.trim()).filter(Boolean) };
    for (const e of entry.en) { byKey.set(norm(e), entry); byKey.set('~' + sortedKey(e), entry); }
    const ws = new Set([...entry.en, entry.ar, ...entry.aliases].flatMap(words));
    ws.forEach(w => partFreq.set(w, (partFreq.get(w) || 0) + 1));
  }
}
const lookup = name => byKey.get(norm(name)) || byKey.get('~' + sortedKey(name)) || null;

module.exports = { norm, words, sortedKey, lookup, partFreq, DATA };
