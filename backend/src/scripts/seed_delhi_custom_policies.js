const { getTenantPrisma } = require('../lib/tenantDatabase.service');

const delhiCustomPolicies = [
  {
    category_id: "DELHI_NCR_ORGANISED_GANG_WARFARE",
    definition: "Social media threats, recruitment, extortion demands, weapon-flashing reels, or gang warfare activities linked to Delhi-NCR organized crime syndicates (Lawrence Bishnoi, Bambiha, Neeraj Bawana, Tillu Tajpuria, Hashim Baba network).",
    severity_level: "Critical",
    keywords: [
      "lawrence bishnoi",
      "neeraj bawana",
      "bambiha syndicate",
      "hashim baba gang",
      "gogi gang",
      "gangster reel delhi",
      "delhi shootout",
      "ncr extortion call"
    ],
    legal_sections: [
      { id: "MCOCA_3_4", code: "MCOCA 3/4", title: "Organized Crime Syndicate & Extortion (as extended to Delhi)" },
      { id: "BNS_111", code: "BNS 111", title: "Organised Crime & Continuing Unlawful Activity" },
      { id: "ARMS_ACT_25_27", code: "Arms Act 25/27", title: "Use and Brandishing of Prohibited Firearms" },
      { id: "BNS_351", code: "BNS 351", title: "Criminal Intimidation (IPC 506)" }
    ],
    platform_policies: {
      x: [{ id: "X_VIOLENT_SPEECH", name: "Violent Speech & Gang Threat Policy" }],
      facebook: [{ id: "FB_DANGEROUS_ORGS", name: "Dangerous Organizations and Street Gangs" }],
      instagram: [{ id: "IG_FIREARMS_VIOLENCE", name: "Firearms, Weapon Display and Violent Extortion" }],
      youtube: [{ id: "YT_VIOLENT_ORGS", name: "Violent Gangs and Criminal Glorification Policy" }],
      telegram: [{ id: "TG_EXTORTION", name: "Terms prohibiting Extortion & Criminal Syndicate Communication" }],
      reddit: [{ id: "RD_VIOLENCE", name: "Rule 1: Prohibition of Gang Warfare and Threats" }]
    }
  },
  {
    category_id: "DELHI_BORDER_PROTEST_ROAD_BLOCKADE_INTEL",
    definition: "Social media mobilization for unauthorized blockade of National Capital borders (Singhu, Tikri, Ghazipur, Badarpur, Chilla), unlawful tractor marches, highway occupations, or deliberate disruption of essential transit into Delhi.",
    severity_level: "High",
    keywords: [
      "singhu border jam",
      "ghazipur border block",
      "delhi chalo call",
      "tractor march blockade",
      "seal delhi border",
      "tikri border protest violent"
    ],
    legal_sections: [
      { id: "BNS_126", code: "BNS 126", title: "Wrongful restraint and obstruction of public transit (IPC 341)" },
      { id: "BNS_223", code: "BNS 223", title: "Disobedience to Sec 144 BNSS Orders in Delhi (IPC 188)" },
      { id: "NH_ACT_8B", code: "NH Act 8B", title: "Mischief and disruption of National Highway transit" },
      { id: "DP_ACT_31", code: "Delhi Police Act 31", title: "Regulation of traffic and prevention of public obstruction" }
    ],
    platform_policies: {
      x: [{ id: "X_CRISIS_RESPONSE", name: "Crisis Response and Public Safety Policy" }],
      facebook: [{ id: "FB_VIOLENCE_INCITEMENT", name: "Mob Mobilization and Civil Disruption Policy" }],
      instagram: [{ id: "IG_PUBLIC_HARM", name: "Call to Action Causing Critical Transit Disruptions" }],
      youtube: [{ id: "YT_PUBLIC_SAFETY", name: "Public Safety & Civil Disruption Policy" }],
      telegram: [{ id: "TG_TRANSIT_BLOCKADE", name: "Terms of Service - Coordination of Unlawful Blockades" }],
      reddit: [{ id: "RD_CIVIL_DISRUPTION", name: "Prohibition of Organizing Dangerous Transit Disruptions" }]
    }
  },
  {
    category_id: "ILLEGAL_ROOFTOP_HOOKAH_BARS_NIGHTLIFE_VIOLATIONS",
    definition: "Promotion, invites, or operation of unauthorized hookah lounges, illegal rooftop clubs, underage drinking, or late-night narcotics parties across Delhi nightlife hotspots (Hauz Khas Village, Connaught Place, Rajouri Garden, Mehrauli).",
    severity_level: "Medium",
    keywords: [
      "hookah bar delhi",
      "hkv party illegal",
      "underage club entry delhi",
      "late night rave delhi",
      "illegal lounge cp",
      "rajouri hookah club"
    ],
    legal_sections: [
      { id: "DP_ACT_28_112", code: "Delhi Police Act 28/112", title: "Licensing regulations for eating houses & places of public entertainment" },
      { id: "COTPA_4_21", code: "COTPA 4/21", title: "Prohibition of smoking & illegal hookah in commercial premises" },
      { id: "EXCISE_ACT_33", code: "Delhi Excise Act 33", title: "Unlawful possession, sale or service of liquor to minors" }
    ],
    platform_policies: {
      x: [{ id: "X_REGULATED_GOODS", name: "Illegal or Regulated Goods & Services Policy" }],
      facebook: [{ id: "FB_RESTRICTED_GOODS", name: "Restricted Goods - Tobacco, Hookah & Unlicensed Venues" }],
      instagram: [{ id: "IG_REGULATED_SUBSTANCES", name: "Tobacco & Illegal Nightlife Promotion Policy" }],
      youtube: [{ id: "YT_REGULATED_GOODS", name: "Sale of Regulated Goods and Services" }],
      telegram: [{ id: "TG_ILLICIT_PARTIES", name: "Terms prohibiting Illegal Event Promotion & Contraband" }],
      reddit: [{ id: "RD_PROHIBITED_GOODS", name: "Rule 7: Prohibited Transactions & Unlicensed Commercial Services" }]
    }
  },
  {
    category_id: "CYBER_SIM_SWAP_MEWAT_JAM_SYNDICATE",
    definition: "Coordinated SIM-swap fraud, fake Aadhaar biometrics, caller ID spoofing, mule bank account leasing, and digital arrest extortion calls targeting citizens and senior residents in Delhi NCR.",
    severity_level: "High",
    keywords: [
      "mewat cyber gang",
      "sim swap delhi",
      "jamtara delhi target",
      "mule account buyer delhi",
      "fake calling center delhi",
      "digital arrest call delhi"
    ],
    legal_sections: [
      { id: "IT_ACT_66C", code: "IT Act 66C", title: "Identity theft and stolen biometric/electronic credentials" },
      { id: "IT_ACT_66D", code: "IT Act 66D", title: "Cheating by personation using computer resource" },
      { id: "BNS_318_4", code: "BNS 318(4)", title: "Cheating & dishonestly inducing delivery of property (IPC 420)" },
      { id: "TELECOM_ACT_28", code: "Telecom Act 2023 Sec 28", title: "Protection of telecommunication users against spoofing" }
    ],
    platform_policies: {
      x: [{ id: "X_SCAMS_FRAUD", name: "Scams, Financial Manipulation and Spoofing Policy" }],
      facebook: [{ id: "FB_FRAUD_DECEPTION", name: "Fraud, Deception and Phishing Services Policy" }],
      instagram: [{ id: "IG_FRAUD_SCAMS", name: "Fraud, Financial Scams and Mule Account Solicitation" }],
      youtube: [{ id: "YT_SPAM_SCAMS", name: "Spam, Deceptive Practices and Scam Operations" }],
      telegram: [{ id: "TG_SCAMS_MULES", name: "Prohibition of Phishing Bots, Mule Accounts and SIM Fraud" }],
      reddit: [{ id: "RD_SPAM_PHISHING", name: "Rule on Malware, Phishing and Deceptive Telecom Services" }]
    }
  }
];

async function seedDelhiCustomPolicies() {
  console.log('--- Seeding Custom Delhi Police Policies into Delhi Tenant Database ---');
  const delhiPrisma = getTenantPrisma('blurasaga_delhipolice_delhi_blura_saga_2');
  if (!delhiPrisma) {
    console.error('Could not connect to Delhi Police tenant database.');
    process.exit(1);
  }

  for (const p of delhiCustomPolicies) {
    const row = await delhiPrisma.policy_mappings.upsert({
      where: { category_id: p.category_id },
      create: {
        category_id: p.category_id,
        definition: p.definition,
        severity_level: p.severity_level,
        keywords: p.keywords,
        legal_sections: p.legal_sections,
        platform_policies: p.platform_policies,
        is_active: true,
      },
      update: {
        definition: p.definition,
        severity_level: p.severity_level,
        keywords: p.keywords,
        legal_sections: p.legal_sections,
        platform_policies: p.platform_policies,
        is_active: true,
      },
    });
    console.log(`✓ Seeded custom Delhi policy: ${row.category_id}`);
  }

  console.log(`Successfully seeded ${delhiCustomPolicies.length} custom Delhi Police policies.`);
}

seedDelhiCustomPolicies().catch(console.error);
