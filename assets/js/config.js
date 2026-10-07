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
  // Dernier instantané connu des projets publiés. Le serveur/Supabase reste prioritaire.
  publishedProjectsFallback: [
    { id:"4da3c9f7-c2f8-4bac-b709-4cad2fa2b8a0", slug:"energie-solaire", title:"ENERGIE SOLAIRE", badge:"", description:"", category:"solar", image_url:"assets/img/projet-solaire.jpg", minimum_amount:3000, duration_days:15, daily_return_amount:500, return_terms:"Rendement estimatif affiché à titre indicatif.", status:"published" },
    { id:"60716a74-e045-44ac-8ab8-d037f5a44d51", slug:"immeuble", title:"IMMEUBLE", badge:"", description:"", category:"real_estate", image_url:"assets/img/projet-immobilier.jpg", minimum_amount:3000, duration_days:15, daily_return_amount:500, return_terms:"Rendement estimatif affiché à titre indicatif.", status:"published" },
    { id:"64faea0d-e685-4951-9a2e-138f5c10d579", slug:"airline", title:"Airline", badge:"", description:"", category:"wind", image_url:"assets/img/projet-vent.jpg", minimum_amount:6000, duration_days:15, daily_return_amount:1000, return_terms:"Rendement estimatif affiché à titre indicatif.", status:"published" },
    { id:"114cfdf6-c05f-4458-894d-481a64e8d6db", slug:"agriculture", title:"Agriculture", badge:"", description:"", category:"agriculture", image_url:"assets/img/projet-agri.jpg", minimum_amount:6000, duration_days:15, daily_return_amount:1000, return_terms:"Rendement estimatif affiché à titre indicatif.", status:"published" },
    { id:"ddd96372-08d8-4f71-9fb1-69e901cf6b53", slug:"agriculture-modene", title:"Agriculture Modène", badge:"", description:"", category:"agriculture", image_url:"assets/img/projet-agri.jpg", minimum_amount:9000, duration_days:15, daily_return_amount:1500, return_terms:"Rendement estimatif affiché à titre indicatif.", status:"published" },
    { id:"3c06b216-4d97-462a-8f03-494622ec704e", slug:"energie-modernes-renouvelable", title:"Énergie modernes renouvelable", badge:"", description:"", category:"solar", image_url:"assets/img/projet-solaire.jpg", minimum_amount:12000, duration_days:15, daily_return_amount:2000, return_terms:"Rendement estimatif affiché à titre indicatif.", status:"published" },
    { id:"16502ad6-d348-4231-a5db-e63c85e50940", slug:"energie-renouvelable-moderne", title:"Énergie renouvelable moderne", badge:"", description:"", category:"other", image_url:"assets/img/projet-solaire.jpg", minimum_amount:20000, duration_days:5, daily_return_amount:7000, return_terms:"SPECIAL: Rendement estimatif affiché à titre indicatif.", status:"published" },
    { id:"d0a84361-7a0b-48ec-9098-804e76fbc290", slug:"immeuble-moderne", title:"Immeuble moderne", badge:"", description:"", category:"other", image_url:"assets/img/projet-immobilier.jpg", minimum_amount:30000, duration_days:5, daily_return_amount:10000, return_terms:"SPECIAL: Rendement estimatif affiché à titre indicatif.", status:"published" }
  ],

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
