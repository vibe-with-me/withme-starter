import { createFileRoute } from '@tanstack/react-router';

/**
 * The sections an operator will have, in #100's order of value. Each
 * becomes a <Link> to its page when its issue lands: reports (#135), tags
 * (#136), gatherings (#137).
 */
const SECTIONS = [
  { name: 'Reports', about: 'Open reports, child safety first, and what to do about each one.' },
  { name: 'Tags', about: 'Provision a batch, see what is claimed, and turn a tag off.' },
  { name: 'Gatherings', about: 'Find a gathering and take it down.' },
] as const;

export const Route = createFileRoute('/admin/')({
  component: AdminHome,
});

function AdminHome() {
  return (
    <div className="stack">
      <div className="card">
        <h1>Admin</h1>
        <p className="hint">
          For the people who run this community. What you do here acts on everyone&rsquo;s data, so
          take your time.
        </p>
      </div>
      <section aria-labelledby="admin-sections">
        <h2 className="section-title" id="admin-sections">
          Sections
        </h2>
        <ul className="admin-sections" aria-labelledby="admin-sections">
          {SECTIONS.map((section) => (
            <li className="row" key={section.name}>
              <div className="row-body">
                <span className="name">{section.name}</span>
                <span className="sub">{section.about}</span>
              </div>
              <span className="hint">Coming soon</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
