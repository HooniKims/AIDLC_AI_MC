const coneUrl = new URL("../../assets/site/confesta-ice-cream-cone.png", import.meta.url).href;
const sparkleUrl = new URL("../../assets/site/confesta-hero-sparkle.png", import.meta.url).href;

interface ConfestaBackdropProps {
  mode?: "full" | "preview";
}

export function ConfestaBackdrop({ mode = "full" }: ConfestaBackdropProps) {
  return (
    <div className={`confesta-backdrop confesta-backdrop--${mode}`} aria-hidden="true">
      <img className="confesta-backdrop__sparkle sparkle-a" src={sparkleUrl} alt="" />
      <img className="confesta-backdrop__sparkle sparkle-b" src={sparkleUrl} alt="" />
      <img className="confesta-backdrop__cone" src={coneUrl} alt="" draggable="false" />
      <div className="confesta-backdrop__ribbon ribbon-a">AI·DIGITAL LEARNING CONFESTA</div>
      <div className="confesta-backdrop__ribbon ribbon-b">2026</div>
    </div>
  );
}
