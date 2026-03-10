import { useEffect, useState } from "react";

export default function SplashScreen() {
  const [fading, setFading] = useState(false); // styrer CSS fade
  const [hidden, setHidden] = useState(false); // unmount efter fade

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 2200); // start fade
    const t2 = setTimeout(() => setHidden(true), 3000); // fjern helt (unmount)

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (hidden) return null;

  return (
    <div className={`splash-screen ${fading ? "fade-out" : ""}`}>
      <h1 className="splash-title">Collectify</h1>
    </div>
  );
}
