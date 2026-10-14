import { useEffect, useState } from "react";

export type FontStatus = { serif: boolean; sans: boolean };

/**
 * Whether the two thmanyah families have actually loaded in this browser (not just been declared).
 * `document.fonts.load` fetches a declared face and resolves with the faces that matched, so an
 * empty result means the font file did not load.
 */
export async function checkFonts(fonts: Pick<FontFaceSet, "load"> | undefined = document.fonts) {
  const ok = async (spec: string) => {
    try {
      return ((await fonts?.load(spec, "مشروع")) ?? []).length > 0;
    } catch {
      return false;
    }
  };
  const [serif, sans] = await Promise.all([
    ok('700 24px "Thmanyah Serif Display"'),
    ok('400 24px "Thmanyah Sans"'),
  ]);
  return { serif, sans } satisfies FontStatus;
}

/** Null while checking. */
export function useFontStatus(): FontStatus | null {
  const [s, setS] = useState<FontStatus | null>(null);
  useEffect(() => {
    let live = true;
    checkFonts().then((x) => live && setS(x));
    return () => {
      live = false;
    };
  }, []);
  return s;
}

export const fontLine = (s: FontStatus | null) =>
  !s
    ? "الخط: جارٍ التحقق…"
    : s.serif && s.sans
      ? "الخط: ثمانية، خطّ العناوين وخطّ النص ✓"
      : "الخط: لم يتحمل خط ثمانية، يظهر بديل";
