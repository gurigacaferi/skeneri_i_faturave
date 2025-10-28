export const NJESIA_OPTIONS = [
  "cope",
  "kg",
  "g",
  "L",
  "ml",
  "m",
  "cm",
  "m2",
  "m3",
  "kWh",
  "dite",
  "ore",
  "muaj",
  "vit",
  "pakete",
  "shishe",
  "kuti",
  "tjeter",
];

export const VAT_CODES = [
  "[31] Blerjet dhe importet pa TVSH", "[32] Blerjet dhe importet investive pa TVSH", "[33] Blerjet dhe importet me TVSH jo të zbritshme", "[34] Blerjet dhe importet investive me TVSH jo të zbritshme", "[35] Importet 18%", "[37] Importet 8%", "[39] Importet investive 18%", "[41] Importet investive 8%", "[43] Blerjet vendore 18%", "No VAT", "[45] Blerjet vendore 8%", "[47] Blerjet investive vendore 18%", "[49] Blerjet investive vendore 8%", "[65] E drejta e kreditimit të TVSH-së në lidhje me Ngarkesën e Kundërt 18%", "[28] Blerjet që i nënshtrohen ngarkesës së kundërt 18%",
];

export const EXPENSE_CATEGORIES = {
  "660 Shpenzime te personelit": ["660-01 Paga bruto", "660-02 Sigurimi shendetesor", "660-03 Kontributi pensional"],
  "665 Shpenzimet e zyres": ["665-01 Shpenzimet e qirase", "665-02 Material harxhues", "665-03 Pastrimi", "665-04 Ushqim dhe pije", "665-05 Shpenzime te IT-se", "665-06 Shpenzimt e perfaqesimit", "665-07 Asete nen 1000 euro", "665-09 Te tjera"],
  "667 Sherbimet profesionale": ["667-01 Sherbimet e kontabilitetit", "667-02 Sherbime ligjore", "667-03 Sherbime konsulente", "667-04 Sherbime auditimi"],
  "668 Shpenzimet e udhetimit": ["668-01 Akomodimi", "668-02 Meditja", "668-03 Transporti"],
  "669 Shpenzimet e automjetit": ["669-01 Shpenzimet e karburantit", "669-02 Mirembajtje dhe riparim"],
  "675 Shpenzimet e komunikimit": ["675-01 Interneti", "675-02 Telefon mobil", "675-03 Dergesa postare", "675-04 Telefon fiks"],
  "683 Shpenzimet e sigurimit": ["683-01 Sigurimi i automjeteve", "683-02 Sigurimi i nderteses"],
  "686 Komunalite": ["686-01 Energjia elektrike", "686-02 Ujesjellesi", "686-03 Pastrimi", "686-04 Shpenzimet e ngrohjes"],
  "690 Shpenzime tjera operative": ["690-01 Shpenzimet e anetaresimit", "690-02 Shpenzimet e perkthimit", "690-03 Provizion bankar", "690-04 Mirembajtje e webfaqes", "690-05 Taksa komunale", "690-06 Mirembajtje e llogarise bankare"],
};

export const ALL_SUBCATEGORIES = Object.values(EXPENSE_CATEGORIES).flat();

export const getPercentageFromVatCode = (vatCode: string): number => {
  if (vatCode === "No VAT" || vatCode.includes("pa TVSH") || vatCode.includes("jo të zbritshme")) return 0;
  const match = vatCode.match(/(\d+)%/);
  return match ? parseInt(match[1], 10) : 0;
};