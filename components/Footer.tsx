import Link from "next/link";

export default function Footer() {
  return (
    <footer className="foot">
      <div className="wrap cols">
        <div><b>Launch</b><Link href="/#launch">New launch</Link><Link href="/#pairs">Pairs</Link><Link href="/#fee-forward">Fee Forward</Link></div>
        <div><b>Trade</b><Link href="/#live">Live launches</Link><Link href="/#recent">Launch chains</Link></div>
        <div><b>Creators</b><Link href="/vault">Creator vault</Link></div>
        <div><b>Built on</b><a href="https://docs.meteora.ag" target="_blank" rel="noreferrer">Meteora DAMM v2</a><a href="https://dev.jup.ag" target="_blank" rel="noreferrer">Jupiter</a></div>
      </div>
      <div className="wrap legal">
        Meme coins are highly volatile and can go to zero. Nothing here is investment advice. Only launch or trade with funds you can afford to lose. Pools run on Meteora&apos;s DAMM v2 program; FORWARD never holds your funds. © FORWARD
      </div>
    </footer>
  );
}
