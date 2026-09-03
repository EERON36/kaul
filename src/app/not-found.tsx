import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page-content">
      <p className="eyebrow">Kaul</p>
      <h1>Sidan kunde inte hittas</h1>
      <p className="introductory-text">
        Den kan ha tagits bort eller kan inte visas.
      </p>
      <Link className="secondary-button button-link" href="/">
        Gå till Översikt
      </Link>
    </main>
  );
}
