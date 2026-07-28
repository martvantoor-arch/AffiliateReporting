"use client";

import { useCallback, useEffect, useState } from "react";

import {
  pushPublicKeyAction,
  subscribePushAction,
  testPushAction,
  unsubscribePushAction,
} from "@/lib/push/actions";

type State =
  | "laden"
  | "niet-ondersteund"
  | "geen-webapp"
  | "geweigerd"
  | "uit"
  | "aan";

/**
 * Notificaties aan- of uitzetten voor dít apparaat. Een abonnement hoort bij
 * één browser op één toestel, dus dit moet je op je iPhone en je iPad apart
 * doen — vandaar dat de tekst per situatie verschilt.
 */
export function PushToggle({ configured }: { configured: boolean }) {
  const [state, setState] = useState<State>("laden");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const detect = async () => {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!cancelled) setState("niet-ondersteund");
        return;
      }

      // Op iOS bestaat Web Push alleen in een app die op het beginscherm staat.
      // In Safari zelf ontbreekt PushManager meestal al, maar niet altijd.
      if (isApple() && !isStandalone()) {
        if (!cancelled) setState("geen-webapp");
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) setState("geweigerd");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const existing = await registration?.pushManager.getSubscription();
        if (!cancelled) setState(existing ? "aan" : "uit");
      } catch {
        if (!cancelled) setState("uit");
      }
    };

    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const publicKey = await pushPublicKeyAction();
      if (!publicKey) {
        setError(
          "De server heeft nog geen VAPID-sleutels. Zet VAPID_PUBLIC_KEY en VAPID_PRIVATE_KEY in de omgevingsvariabelen.",
        );
        return;
      }

      // Moet uit een klik komen; iOS negeert het verzoek anders stilzwijgend.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "geweigerd" : "uit");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys?.auth) {
        setError("De browser gaf een onvolledig abonnement terug.");
        return;
      }

      await subscribePushAction({
        endpoint: subscription.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        label: deviceLabel(),
      });

      setState("aan");
      setNote("Aan op dit apparaat.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Aanzetten mislukte: ${cause.message}`
          : "Aanzetten mislukte.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await unsubscribePushAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("uit");
      setNote("Uit op dit apparaat.");
    } catch (cause) {
      setError(
        cause instanceof Error ? `Uitzetten mislukte: ${cause.message}` : "Uitzetten mislukte.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const test = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const delivered = await testPushAction();
      setNote(
        delivered > 0
          ? `Proefmelding verstuurd naar ${delivered} apparaat(en).`
          : "Geen apparaten om naar te sturen.",
      );
    } catch {
      setError("De proefmelding kon niet worden verstuurd.");
    } finally {
      setBusy(false);
    }
  }, []);

  if (!configured) {
    return (
      <p className="text-sm text-ink-2">
        Notificaties staan uit op de server. Zet <code className="tnum">VAPID_PUBLIC_KEY</code>,{" "}
        <code className="tnum">VAPID_PRIVATE_KEY</code> en{" "}
        <code className="tnum">VAPID_SUBJECT</code> in de omgevingsvariabelen en start de app
        opnieuw. Zie de README.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm text-ink-2">{explain(state)}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {state === "uit" ? (
          <button
            type="button"
            className="btn-accent px-4 py-2.5 text-sm"
            onClick={() => void enable()}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? "Bezig…" : "Notificaties aanzetten"}
          </button>
        ) : null}

        {state === "aan" ? (
          <>
            <button
              type="button"
              className="btn-quiet px-3.5 py-2 text-sm"
              onClick={() => void test()}
              disabled={busy}
            >
              Proefmelding sturen
            </button>
            <button
              type="button"
              className="btn-quiet px-3.5 py-2 text-sm"
              onClick={() => void disable()}
              disabled={busy}
            >
              Uitzetten op dit apparaat
            </button>
          </>
        ) : null}
      </div>

      {note ? <p className="mt-2 text-xs text-ink-2">{note}</p> : null}
      {error ? (
        <p className="mt-2 text-xs" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function explain(state: State): string {
  switch (state) {
    case "laden":
      return "Even kijken wat dit apparaat kan…";
    case "niet-ondersteund":
      return "Deze browser kan geen pushberichten ontvangen.";
    case "geen-webapp":
      return "Op iPhone en iPad werken notificaties alleen als Kasboek op je beginscherm staat. Tik in Safari op Deel → Zet op beginscherm, open de app daarvandaan en kom hier terug.";
    case "geweigerd":
      return "Je hebt meldingen eerder geweigerd. Dat kan alleen in de instellingen van je toestel weer aan: Instellingen → Berichtgeving → Kasboek.";
    case "uit":
      return "Krijg een melding zodra er een nieuwe sale binnenkomt. Dit geldt per apparaat, dus zet het ook even aan op je andere toestel.";
    case "aan":
      return "Aan op dit apparaat. Je krijgt een melding zodra er een nieuwe sale binnenkomt.";
  }
}

function isApple(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS doet zich voor als macOS, maar heeft wel aanraakbediening.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Iets herkenbaars om apparaten uit elkaar te houden in de database. */
function deviceLabel(): string {
  const agent = navigator.userAgent;
  if (/iPad/.test(agent)) return "iPad";
  if (/iPhone/.test(agent)) return "iPhone";
  if (/Android/.test(agent)) return "Android";
  if (/Mac/.test(agent)) return "Mac";
  if (/Windows/.test(agent)) return "Windows";
  return "Onbekend apparaat";
}

/**
 * De VAPID-sleutel komt als base64url-tekst, maar `subscribe` wil ruwe bytes.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);
  // Expliciet over een ArrayBuffer: subscribe() accepteert geen buffer die ook
  // gedeeld zou kunnen zijn, en dat is precies wat het kale Uint8Array-type zegt.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}
