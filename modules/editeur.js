import { escapeHtml } from './utils.js';

// Identité de l'entreprise qui conçoit et développe GEST SCHOOL SCOLARITÉ (source unique : centre d'aide,
// écran de connexion). La fenêtre « À propos » de l'application de bureau (electron/main.js) reprend ces informations.
export const EDITEUR = {
  nom: 'SOCIÉTÉ KJS GROUP SARL',
  activites: 'Solutions numériques • Réseaux & systèmes • Formation',
  devise: 'Vision — Stratégie — Action',
  email: 'kjsgroup2025@gmail.com',
  telephones: ['+224 664-33-33-66'],
  logo: './assets/logo%20entreprise.png',
  fondation: 2025,
  presentation: [
    'Fondée en 2025, la Société KJS.Group accompagne les entreprises, startups et jeunes talents dans leur développement au sein d’un monde numérique connecté. Nous intervenons dans la conception de solutions logicielles, la gestion de bases de données, le déploiement de systèmes ERP & CRM, l’installation de réseaux informatiques, ainsi que la formation professionnelle en informatique, réseaux et technologies Microsoft.',
    'KJS.Group a été fondée par trois jeunes diplômés en Génie Informatique, Télécommunications et Génie Logiciel, certifiés Cisco, unis par une vision commune : créer un écosystème numérique durable où les entreprises et les talents évoluent ensemble.'
  ],
  services: [
    'Conception et développement d’applications web et mobiles sur mesure',
    'Architecture et gestion de bases de données',
    'Analyse des besoins et rédaction de cahiers des charges',
    'Intégration, maintenance et évolution des solutions',
    'Optimisation et sécurisation applicative',
    'Conseil et expertise en ingénierie logicielle'
  ]
};

export const APPLICATION = { nom: 'GEST SCHOOL SCOLARITÉ', version: '4.2.0' };

// Fiche « À propos de l'éditeur » (centre d'aide)
export function editeurHtml() {
  const e = EDITEUR;
  return `<section class="panel editeur-panel" id="aide-editeur" aria-labelledby="editeur-titre">
    <div class="editeur-entete">
      <img class="editeur-logo" src="${e.logo}" alt="Logo de ${escapeHtml(e.nom)}" width="120" height="125" />
      <div>
        <span class="eyebrow">Éditeur du logiciel</span>
        <h3 id="editeur-titre">${escapeHtml(e.nom)}</h3>
        <p class="editeur-activites">${escapeHtml(e.activites)}</p>
        <p class="editeur-devise">${escapeHtml(e.devise)}</p>
        <p class="editeur-contacts">
          <a href="mailto:${escapeHtml(e.email)}">✉ ${escapeHtml(e.email)}</a>
          ${e.telephones.map((t) => `<a href="tel:${escapeHtml(t.replace(/[^+\d]/g, ''))}">☎ ${escapeHtml(t)}</a>`).join('')}
        </p>
      </div>
    </div>
    ${e.presentation.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
    <h4>Nos services</h4>
    <ul class="editeur-services">${e.services.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
    <p class="meta">${escapeHtml(APPLICATION.nom)} — version ${escapeHtml(APPLICATION.version)} · conçu et développé par ${escapeHtml(e.nom)}. Assistance, maintenance et clés de licence : ${escapeHtml(e.email)}.</p>
  </section>`;
}

// Mention courte (écran de connexion)
export function editeurMentionHtml() {
  return `<p class="login-editeur"><img src="${EDITEUR.logo}" alt="" width="22" height="23" /> Conçu et développé par <b>${escapeHtml(EDITEUR.nom)}</b></p>`;
}
