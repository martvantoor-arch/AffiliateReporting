// eslint-config-next 16 levert zelf een flat config; de FlatCompat-omweg uit
// het projectsjabloon is daarmee niet meer nodig (en werkt er ook niet mee).
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
