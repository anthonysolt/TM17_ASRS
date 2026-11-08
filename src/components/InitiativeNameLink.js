import Link from 'next/link';

/** Initiative name that links to the initiative's own page. */
export default function InitiativeNameLink({ initiative }) {
  return (
    <Link
      href={`/initiatives/${initiative.id}/manage`}
      className="initiative-link"
      title={`Open ${initiative.name}`}
    >
      {initiative.name}
    </Link>
  );
}
