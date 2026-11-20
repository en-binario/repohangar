import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './index.module.css';

type Feature = {
  title: string;
  text: ReactNode;
  gif: string;
  alt: string;
  to: string;
  more: string;
};

const FEATURES: Feature[] = [
  {
    title: 'Fetch and pull everything at once',
    text: (
      <>
        <kbd>F</kbd> fetches every repository. <strong>Pull all (ff)</strong> fast-forwards the clean ones and skips
        the rest with a reason, never forcing, merging or rebasing. A result panel fixes what was skipped in one click.
      </>
    ),
    gif: 'd2-fetch-pull.gif',
    alt: 'Fetch all, then Pull (ff) on the repositories that are behind; Stash and pull fixes the one that was skipped',
    to: '/docs/guide/batch-operations/',
    more: 'Fetch and pull',
  },
  {
    title: 'One branch across repositories',
    text: (
      <>
        Select the repositories of a feature, press <kbd>n</kbd> and type the branch name once. <kbd>b</kbd> switches
        them all back, offering to stash the ones with uncommitted changes.
      </>
    ),
    gif: 'd3-branches.gif',
    alt: 'n creates a branch in three selected repositories; b switches them back to main, stashing the dirty one',
    to: '/docs/guide/branches/',
    more: 'Branches across repositories',
  },
  {
    title: 'Merge requests in one keystroke',
    text: (
      <>
        <kbd>m</kbd> opens the Create MR drawer filled in from your team's profile: target, title, reviewers,
        labels, squash. <kbd>Ctrl</kbd>+<kbd>Enter</kbd> pushes the branch and creates it, on GitLab or GitHub.
      </>
    ),
    gif: 'd4-create-mr.gif',
    alt: 'm opens the Create MR drawer filled in from the profile; Ctrl+Enter pushes 2 commits and creates !142',
    to: '/docs/merge-requests/creating/',
    more: 'Creating merge requests',
  },
  {
    title: 'Linked merge requests for a whole feature',
    text: (
      <>
        Filter by the ticket, select all, press <kbd>m</kbd>: one merge request or pull request per repository, each
        description linking the others.
      </>
    ),
    gif: 'd5-linked-mrs.gif',
    alt: 'Three repositories of ABC-123 selected; m creates !142, !143 and #311, each description linking the others',
    to: '/docs/merge-requests/several-repositories/',
    more: 'Several repositories',
  },
  {
    title: 'Git Graph beside the dashboard',
    text: (
      <>
        Click a repository name and its graph opens in Git Graph, or in VS Code's Source Control Graph when Git Graph
        isn't installed. <kbd>e</kbd> reveals it in the Explorer, <kbd>s</kbd> shows its changes.
      </>
    ),
    gif: 'd7-split-graph.gif',
    alt: 'The dashboard on the left and Git Graph on the right, switching repository with each click on a name',
    to: '/docs/integrations/git-graph/',
    more: 'Git Graph integration',
  },
];

function Demo({ gif, alt, eager = false }: { gif: string; alt: string; eager?: boolean }) {
  return (
    <figure className={styles.window}>
      <div className={styles.windowBar} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <img
        src={useBaseUrl(`/media/${gif}`)}
        alt={alt}
        width={1279}
        height={799}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
      />
    </figure>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="Multi-repo Git dashboard for VS Code"
      description="RepoHangar shows every Git repository in your VS Code workspace on one dashboard, acts on all of them at once, and creates GitLab merge requests and GitHub pull requests with your team's defaults."
    >
      <header className={styles.hero}>
        <div className="container">
          <div className={styles.heroGrid}>
            <div>
              <p className={styles.badge}>Preview · VS Code extension</p>
              <Heading as="h1" className={styles.title}>
                Every repository in your workspace, on one dashboard.
              </Heading>
              <p className={styles.lead}>
                RepoHangar shows the branch, sync state, changes and merge request of every Git repository at a
                glance, acts on all of them at once, and opens GitLab merge requests or GitHub pull requests with
                your team's defaults in one keystroke.
              </p>
              <div className={styles.actions}>
                <Link className="button button--primary button--lg" to="/docs/getting-started/">
                  Get started
                </Link>
                <Link className="button button--secondary button--lg" href="https://github.com/en-binario/repohangar">
                  View on GitHub
                </Link>
              </div>
              <p className={styles.shortcut}>
                <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>H</kbd> opens it (<kbd>Ctrl</kbd>+<kbd>Cmd</kbd>+<kbd>H</kbd> on
                macOS).
              </p>
            </div>
            <Demo
              gif="d1-dashboard.gif"
              alt="Ctrl+Alt+H opens the dashboard; the / filter, the Behind chip, sorting by Sync and the key help"
              eager
            />
          </div>
        </div>
      </header>

      <main>
        <section className={styles.highlights} aria-label="Highlights">
          <div className="container">
            <ul className={styles.highlightList}>
              <li>
                <strong>Live</strong>
                <span>Rows update as soon as Git changes. RepoHangar never polls.</span>
              </li>
              <li>
                <strong>Keyboard first</strong>
                <span>Move, filter, select and act without the mouse. Press ? for every key.</span>
              </li>
              <li>
                <strong>GitLab and GitHub</strong>
                <span>Including self-hosted GitLab and GitHub Enterprise.</span>
              </li>
              <li>
                <strong>Tokens stay local</strong>
                <span>In VS Code's secret storage, sent only to their own host.</span>
              </li>
            </ul>
          </div>
        </section>

        {FEATURES.map((f, i) => (
          <section key={f.gif} className={styles.feature}>
            <div className={`container ${styles.featureGrid} ${i % 2 ? styles.reverse : ''}`}>
              <div className={styles.featureText}>
                <Heading as="h2">{f.title}</Heading>
                <p>{f.text}</p>
                <Link to={f.to}>{f.more} →</Link>
              </div>
              <Demo gif={f.gif} alt={f.alt} />
            </div>
          </section>
        ))}

        <section className={styles.cta}>
          <div className="container">
            <Heading as="h2">Try it on your workspace</Heading>
            <p>Free and open source under the MIT License. Requires VS Code 1.93 or later and Git.</p>
            <Link className="button button--primary button--lg" to="/docs/getting-started/">
              Install RepoHangar
            </Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}
