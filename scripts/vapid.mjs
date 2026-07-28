/**
 * Genereert een VAPID-sleutelpaar voor pushnotificaties.
 *
 *   npm run vapid
 *
 * De publieke sleutel gaat mee naar de browser; de private sleutel blijft op de
 * server en hoort alleen in je omgevingsvariabelen. Draai je dit opnieuw, dan
 * werken bestaande abonnementen niet meer en moet je op elk apparaat opnieuw
 * op "Notificaties aanzetten" tikken.
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log("Zet deze drie in je omgevingsvariabelen (Railway → Variables):\n");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log("VAPID_SUBJECT=mailto:jij@voorbeeld.nl");
console.log(
  "\nVAPID_SUBJECT moet een mailto: of https: zijn; Apple en Google gebruiken het als contactadres.",
);
