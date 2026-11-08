/* =========================================================
   NOVA — Configuration du site
   Marque, projets, opérateurs mobile money, contacts…
   Modifiez ce fichier pour adapter le site à votre activité.
   ========================================================= */
window.NOVA = {
  brand: "TTE Energy",
  fullName: "TTE Energy — Pétrole & énergie éolienne",
  tagline: "Pétrole & énergie éolienne",
  currency: "FCFA",
  // API NOVA centralisée sur Render. Les appels restent valides même si le front est servi depuis un autre domaine.
  apiBase: "https://nova-groupe-dpnx.onrender.com",
  // Pas de projets statiques de secours : seuls les projets réellement publiés en base doivent apparaître.
  publishedProjectsFallback: [],

  /* ---------- Contacts / assistance ---------- */
  // Lien officiel de la communauté WhatsApp NOVA Group.
  whatsapp: "https://chat.whatsapp.com/GdjJdEXsXmv4D2jiR6Nrms",
  telegramService: "https://t.me/ttenergie",
  telegramGroup: "https://t.me/ttenergie",
  email: "contact@nova-immo-energie.tg",
  address: "Boulevard du Mono, Lomé — Togo",

  /* ---------- Parrainage (un seul niveau, simple) ---------- */
  referralRate: 0.03, // 3 % sur le premier versement du filleul

  /* ---------- Accès administrateur (démonstration) ---------- */
  admin: null,

  /* ---------- Supabase (à remplir pour la version en ligne) ----------
     Renseignez l’URL et la clé publique Supabase pour préparer la connexion.
     Voir README.md → « Connexion à Supabase ».                       */
  supabase: { url: "https://yidtsgqvnwksdbovovax.supabase.co", anonKey: "sb_publishable_GGR1-nFHrY3dfEV7Ube86Q_Es1YIeDH" },

  /* ---------- Pays & opérateurs mobile money ---------- */
  countries: [
    { code: "+228", label: "Togo",          ops: ["Togocom", "Moov Togo"] },
    { code: "+226", label: "Burkina Faso",  ops: ["Orange Burkina", "Moov Burkina"] },
    { code: "+229", label: "Bénin",         ops: ["MOOV Bénin", "MTN Bénin", "Celtiis Cash"] },
    { code: "+225", label: "Côte d'Ivoire", ops: ["Orange CI", "MTN CI", "Moov CI", "Wave CI", "Djamo CI"] },
    { code: "+221", label: "Sénégal",       ops: ["Orange SN", "Free SN", "Expresso", "Wave SN", "Djamo SN"] },
    { code: "+237", label: "Cameroun",      ops: ["MTN CM"] },
    { code: "+223", label: "Mali",          ops: ["Orange ML", "Moov ML"] }
  ],

  /* ---------- Projets : aucun projet de démonstration. Les projets réels seront publiés par l’administration. ---------- */
  plans: [],
  specials: [],

  /* ---------- Publications / actualités ---------- */
  news: [
    {
      id: "station-lome", date: "Présentation du réseau · novembre 2026", tag: "Stations · Lomé",
      title: "À la découverte des stations TotalEnergies de Lomé",
      img: "assets/img/tte-energy-official.jpg",
      text: "Lomé compte plusieurs stations TotalEnergies répertoriées, notamment Totsi, Hanoukopé, Cacavéli, Agoè, Hédzranawoé et Palais des Congrès. Chaque déplacement est une occasion d’avancer avec énergie, discipline et ambition. Informez-vous toujours auprès du réseau officiel pour les services disponibles dans chaque station."
    },
    {
      id: "station-kara", date: "Présentation du réseau · novembre 2026", tag: "Stations · Kara",
      title: "Kara : des points de service sur les grands axes",
      img: "assets/img/tte-energy-official.jpg",
      text: "Parmi les stations TotalEnergies répertoriées à Kara figurent Kara I, Kara II, Kara III et Kara Tomdè. Sur la route de vos projets, gardez le cap : la constance et la préparation transforment les ambitions en progrès."
    },
    {
      id: "station-sokode", date: "Présentation du réseau · novembre 2026", tag: "Stations · Sokodé",
      title: "Sokodé : un réseau présent au cœur des déplacements",
      img: "assets/img/tte-energy-official.jpg",
      text: "Les annuaires consultés répertorient notamment les stations TotalEnergies Sokodé Barrière, Sokodé Entrée, Sokodé Kédia et Sokodé Marché. Avançons avec confiance : chaque étape compte, et chaque effort construit la réussite de demain."
    },
    {
      id: "station-blitta", date: "Présentation du réseau · novembre 2026", tag: "Stations · Blitta",
      title: "Blitta : une étape sur la Nationale 1",
      img: "assets/img/tte-energy-official.jpg",
      text: "Une station TotalEnergies est répertoriée sur la Nationale 1 à Blitta, sur l’axe Anié–Sokodé. Restons motivés, responsables et tournés vers l’avenir : les grandes réussites commencent par des actions régulières."
    },
    {
      id: "reseau-national", date: "Information générale · novembre 2026", tag: "Énergie au Togo",
      title: "L’énergie accompagne les activités de tous les jours",
      img: "assets/img/tte-energy-official.jpg",
      text: "TotalEnergies indique disposer d’un réseau d’environ 90 stations-service au Togo. Cette publication présente quelques implantations répertoriées à titre informatif. TTE Energy et TotalEnergies sont des entités distinctes ; cette présentation ne signifie ni propriété, ni partenariat, ni approbation commerciale."
    }
  ],

  /* ---------- Chiffres de présentation (démonstration) ---------- */
  stats: { projects: 0, members: "—", distributed: "—" },

  /* ---------- Mention légale ---------- */
  disclaimer: "Site de démonstration. Les montants et rendements affichés sont des estimations indicatives à titre d'illustration. Tout investissement comporte des risques, y compris la perte totale du capital. Aucun rendement n'est garanti."
};
