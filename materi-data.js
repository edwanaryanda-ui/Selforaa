/* Data materi awal (cadangan + sumber impor ke database) */
const MOODS = [['😊', 'Senang'], ['😌', 'Tenang'], ['😐', 'Biasa'], ['😔', 'Sedih'], ['😰', 'Cemas']];

const MATERI = [
  { id: 1, icon: '🪞', title: 'Mengenal Diri Sendiri',
    intro: 'Penerimaan diri dimulai dari mengenal siapa dirimu: nilai yang kamu pegang, hal yang kamu sukai, dan caramu bereaksi pada situasi.',
    body: ['Mengenal diri berarti jujur melihat perasaan, kebiasaan, dan kebutuhanmu tanpa langsung menghakimi. Kamu tidak perlu "sempurna" untuk layak dikenal dan diterima.', 'Mulailah dari pertanyaan sederhana: apa yang membuatku nyaman, apa yang membuatku lelah, dan apa yang penting bagiku?'],
    example: 'Rani selalu ikut organisasi karena teman-temannya ikut. Setelah mencatat perasaannya, ia sadar lebih bahagia saat menulis dan belajar sendiri. Ia lalu memilih satu kegiatan yang sesuai dengan dirinya.',
    q: ['Tiga kata apa yang menggambarkan dirimu saat ini?', 'Kapan kamu merasa paling menjadi dirimu sendiri?', 'Nilai apa yang paling penting dalam hidupmu?'] },
  { id: 2, icon: '🌱', title: 'Memahami dan Menerima Kekurangan Diri',
    intro: 'Setiap orang punya kekurangan. Menerimanya bukan berarti menyerah, tetapi berhenti memusuhi diri sendiri sambil tetap bertumbuh.',
    body: ['Kritik keras pada diri sering terasa memotivasi, padahal justru menambah cemas dan lelah. Welas asih pada diri (self-compassion) membantu kita bangkit lebih cepat setelah gagal.', 'Cobalah memperlakukan dirimu seperti kamu memperlakukan sahabat yang sedang kesulitan.'],
    example: 'Bima gugup saat presentasi dan menyebut dirinya "payah". Ia mengubahnya menjadi: "Aku masih belajar presentasi, dan aku bisa berlatih sedikit demi sedikit." Ia pun lebih berani mencoba.',
    q: ['Kekurangan apa yang paling sering kamu kritik?', 'Apa yang akan kamu katakan pada sahabat yang mengalami hal sama?', 'Satu langkah kecil apa yang bisa kamu lakukan untuk bertumbuh?'] },
  { id: 3, icon: '✨', title: 'Menghargai Kelebihan dan Potensi Diri',
    intro: 'Kita sering lebih mudah melihat kekurangan daripada kekuatan. Belajar menghargai kelebihan membantu membangun rasa percaya diri yang sehat.',
    body: ['Kelebihan tidak selalu berupa prestasi besar. Bisa menjadi pendengar yang baik, tekun, kreatif, atau konsisten juga kekuatan.', 'Potensi tumbuh saat kamu memberinya ruang dan kesempatan, bukan saat kamu menunggu merasa siap sepenuhnya.'],
    example: 'Sinta merasa tidak punya bakat. Teman-temannya justru sering curhat padanya karena ia pendengar yang baik. Kekuatan itu ia kembangkan lewat kegiatan peer counselor.',
    q: ['Apa yang sering dipuji orang lain dari dirimu?', 'Tuliskan tiga hal yang pernah kamu capai, sekecil apa pun.', 'Potensi apa yang ingin kamu kembangkan?'] },
  { id: 4, icon: '🪁', title: 'Mengelola Perbandingan Sosial',
    intro: 'Media sosial dan lingkungan kampus membuat kita mudah membandingkan diri. Perbandingan bisa memotivasi, tetapi sering memicu rasa tidak puas.',
    body: ['Kita biasanya membandingkan "sorotan" hidup orang lain dengan "keseharian" kita sendiri. Itu tidak seimbang.', 'Kenali pemicunya, batasi paparan yang membuatmu lelah, lalu kembalikan fokus pada perjalananmu sendiri.'],
    example: 'Dito merasa tertinggal saat melihat teman magang di perusahaan besar. Ia membatasi waktu media sosial dan mencatat kemajuannya sendiri tiap minggu. Rasa cemasnya perlahan berkurang.',
    q: ['Kapan kamu paling sering membandingkan diri?', 'Apa yang tidak kamu lihat dari hidup orang yang kamu bandingkan?', 'Apa satu perubahan kecil agar kamu lebih nyaman di media sosial?'] },
  { id: 5, icon: '🌅', title: 'Membangun Penerimaan dan Penghargaan terhadap Kehidupan',
    intro: 'Kepuasan hidup tumbuh saat kita bisa menghargai apa yang ada, menerima hal yang tak bisa diubah, dan tetap berharap pada hal yang bisa diusahakan.',
    body: ['Bersyukur bukan berarti menyangkal kesulitan. Kamu boleh sedih dan tetap melihat hal baik yang masih ada.', 'Kebiasaan kecil seperti menuliskan hal yang disyukuri tiap hari membantu otak lebih peka pada hal-hal positif.'],
    example: 'Maya gagal masuk program beasiswa impiannya. Ia memberi waktu untuk kecewa, lalu mencatat hal yang ia syukuri dan mencari kesempatan lain yang tetap sesuai tujuannya.',
    q: ['Tiga hal apa dalam hidupmu yang kamu syukuri hari ini?', 'Apa yang tidak bisa kamu ubah, dan bagaimana kamu bisa berdamai dengannya?', 'Apa yang kamu harapkan dari hidupmu setahun lagi?'] }
];
