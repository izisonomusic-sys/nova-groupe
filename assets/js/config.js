/* =========================================================
   NOVA — Configuration du site
   Marque, projets, opérateurs mobile money, contacts…
   Modifiez ce fichier pour adapter le site à votre activité.
   ========================================================= */
window.NOVA = {
  brand: "NOVA",
  fullName: "NOVA Immobilier & Énergies",
  tagline: "Immobilier & Énergies renouvelables",
  currency: "FCFA",
  // API NOVA centralisée sur Render. Les appels restent valides même si le front est servi depuis un autre domaine.
  apiBase: "https://nova-groupe-dpnx.onrender.com",

  /* ---------- Contacts / assistance ---------- */
  // Lien officiel de la communauté WhatsApp NOVA Group.
  whatsapp: "https://chat.whatsapp.com/GdjJdEXsXmv4D2jiR6Nrms",
  telegramService: "",
  telegramGroup: "",
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
    { code: "+226", label: "Burkina Faso",  ops: ["Orange Burkina", "Faso Cash", "Telecel Faso"] },
    { code: "+229", label: "Bénin",         ops: ["MOOV Bénin", "Orange Bénin"] },
    { code: "+225", label: "Côte d'Ivoire", ops: ["Orange CI", "MTN CI", "Moov CI"] },
    { code: "+233", label: "Ghana",         ops: ["MTN Ghana", "Telecel Ghana"] },
    { code: "+221", label: "Sénégal",       ops: ["Orange SN", "Free SN", "Expresso"] },
    { code: "+237", label: "Cameroun",      ops: ["Orange CM", "MTN CM"] },
    { code: "+223", label: "Mali",          ops: ["Orange ML", "Moov ML"] },
    { code: "+222", label: "Mauritanie",    ops: ["Chinguitel", "Expresso MR"] }
  ],

  /* ---------- Projets : aucun projet de démonstration. Les projets réels seront publiés par l’administration. ---------- */
  plans: [],
  specials: [],

  /* ---------- Publications / actualités ---------- */
  news: [
    {
      id: "n1", date: "22 septembre 2026", tag: "Solaire",
      title: "Lancement de 12 kits solaires communautaires à Kpalimé",
      img: "assets/img/projet-agri.jpg",
      text: "Notre première tranche de financement solaire est partie : 12 kits de 1 kWc seront installés d'ici fin octobre dans des écoles et des foyers ruraux."
    },
    {
      id: "n2", date: "10 septembre 2026", tag: "Immobilier",
      title: "Résidence Les Palmiers : 8 appartements meublés",
      img: "assets/img/projet-immobilier.jpg",
      text: "La résidence de Hédzranan (Lomé) accueille ses premiers locataires. Les revenus de location alimentent le projet NOVA 2."
    },
    {
      id: "n3", date: "28 août 2026", tag: "Énergie",
      title: "Partenariat avec une centrale éolienne du Littoral",
      img: "assets/img/projet-vent.jpg",
      text: "NOVA signe un accord-cadre pour accompagner le financement de 4 turbines sur la côte togolaise."
    }
  ],

  /* ---------- Chiffres de présentation (démonstration) ---------- */
  stats: { projects: 0, members: "—", distributed: "—" },

  /* ---------- Mention légale ---------- */
  disclaimer: "Site de démonstration. Les montants et rendements affichés sont des estimations indicatives à titre d'illustration. Tout investissement comporte des risques, y compris la perte totale du capital. Aucun rendement n'est garanti."
};
