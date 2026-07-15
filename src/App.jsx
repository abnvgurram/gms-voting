import { useEffect, useMemo, useState } from 'react';
import { positions } from './data/contenders.js';

const STORAGE_KEY = 'school-voting-demo';
const ADMIN_PIN = '2905';

const routes = {
  boy: {
    path: '/boy',
    label: 'Head Boy and Deputy Head Boy',
    positionIds: ['head-boy', 'deputy-head-boy'],
  },
  girl: {
    path: '/girl',
    label: 'Head Girl and Deputy Head Girl',
    positionIds: ['head-girl', 'deputy-head-girl'],
  },
};

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'svg'];

function createImageSources(source) {
  if (!source) return [];

  const queryIndex = source.indexOf('?');
  const cleanSource = queryIndex === -1 ? source : source.slice(0, queryIndex);
  const dotIndex = cleanSource.lastIndexOf('.');
  const slashIndex = cleanSource.lastIndexOf('/');
  const hasExtension = dotIndex > slashIndex;
  const basePath = hasExtension ? cleanSource.slice(0, dotIndex) : cleanSource;
  const query = queryIndex === -1 ? '' : source.slice(queryIndex);
  const sources = IMAGE_EXTENSIONS.map((extension) => `${basePath}.${extension}${query}`);

  if (!sources.includes(source)) {
    sources.push(source);
  }

  return sources;
}

function FlexibleImage({ source, alt, className }) {
  const sources = useMemo(() => createImageSources(source), [source]);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [source]);

  if (!sources.length || sourceIndex >= sources.length) return null;

  return (
    <img
      className={className}
      src={sources[sourceIndex]}
      alt={alt}
      onError={() => setSourceIndex((currentIndex) => currentIndex + 1)}
    />
  );
}

function createEmptyVotes() {
  return positions.reduce((positionVotes, position) => {
    positionVotes[position.id] = position.candidates.reduce((candidateVotes, candidate) => {
      candidateVotes[candidate.id] = 0;
      return candidateVotes;
    }, {});
    return positionVotes;
  }, {});
}

function createInitialElection() {
  return {
    status: 'open',
    votes: createEmptyVotes(),
    totalBallots: 0,
    showResults: false,
  };
}

function normalizeElection(savedElection) {
  const allowedStatuses = ['open', 'paused', 'ended'];

  return {
    status: allowedStatuses.includes(savedElection?.status) ? savedElection.status : 'open',
    votes: positions.reduce((positionVotes, position) => {
      positionVotes[position.id] = position.candidates.reduce((candidateVotes, candidate) => {
        candidateVotes[candidate.id] = savedElection?.votes?.[position.id]?.[candidate.id] ?? 0;
        return candidateVotes;
      }, {});
      return positionVotes;
    }, {}),
    totalBallots: Number(savedElection?.totalBallots) || 0,
    showResults: Boolean(savedElection?.showResults),
  };
}

function loadElection() {
  try {
    const savedElection = localStorage.getItem(STORAGE_KEY);
    return savedElection ? normalizeElection(JSON.parse(savedElection)) : createInitialElection();
  } catch {
    return createInitialElection();
  }
}

function getRouteName(pathname) {
  if (pathname.startsWith('/boy')) return 'boy';
  if (pathname.startsWith('/girl')) return 'girl';
  return 'home';
}

function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [election, setElection] = useState(loadElection);
  const [activeStep, setActiveStep] = useState(0);
  const [routeSelections, setRouteSelections] = useState({});
  const [routeComplete, setRouteComplete] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  const routeName = getRouteName(pathname);
  const routeConfig = routes[routeName];
  const votingIsOpen = election.status === 'open';
  const votingIsPaused = election.status === 'paused';
  const votingIsEnded = election.status === 'ended';

  const routePositions = useMemo(() => {
    if (!routeConfig) return [];

    return routeConfig.positionIds.map((positionId) =>
      positions.find((position) => position.id === positionId),
    );
  }, [routeConfig]);

  const activePosition = routePositions[activeStep];

  useEffect(() => {
    function syncPath() {
      setPathname(window.location.pathname);
    }

    window.addEventListener('popstate', syncPath);
    return () => window.removeEventListener('popstate', syncPath);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(election));
  }, [election]);

  useEffect(() => {
    resetRouteFlow();
  }, [routeName]);

  useEffect(() => {
    if (!routeComplete) return undefined;

    if (countdown <= 0) {
      resetRouteFlow();
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setCountdown((currentCountdown) => currentCountdown - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdown, routeComplete]);

  function navigateTo(event, nextPath) {
    event.preventDefault();
    window.history.pushState({}, '', nextPath);
    setPathname(window.location.pathname);
  }

  function resetRouteFlow() {
    setActiveStep(0);
    setRouteSelections({});
    setRouteComplete(false);
    setCountdown(5);
  }

  function recordRouteBallot(finalSelections) {
    setElection((currentElection) => {
      const nextVotes = positions.reduce((votesByPosition, position) => {
        votesByPosition[position.id] = { ...currentElection.votes[position.id] };
        return votesByPosition;
      }, {});

      routePositions.forEach((position) => {
        const selectedCandidateId = finalSelections[position.id];
        nextVotes[position.id][selectedCandidateId] += 1;
      });

      return {
        ...currentElection,
        votes: nextVotes,
        totalBallots: currentElection.totalBallots + 1,
      };
    });
  }

  function voteForCandidate(candidateId) {
    if (!votingIsOpen || routeComplete || !activePosition) return;

    const nextSelections = {
      ...routeSelections,
      [activePosition.id]: candidateId,
    };

    if (activeStep < routePositions.length - 1) {
      setRouteSelections(nextSelections);
      setActiveStep((currentStep) => currentStep + 1);
      return;
    }

    recordRouteBallot(nextSelections);
    setRouteSelections({});
    setRouteComplete(true);
    setCountdown(5);
  }

  function unlockAdmin() {
    if (adminPin === ADMIN_PIN) {
      setAdminUnlocked(true);
      setAdminPin('');
      setPinError('');
      return;
    }

    setPinError('Wrong PIN');
  }

  function pauseOrResumeVoting() {
    setConfirmReset(false);
    setElection((currentElection) => ({
      ...currentElection,
      status: currentElection.status === 'paused' ? 'open' : 'paused',
    }));
  }

  function endVoting() {
    setConfirmReset(false);
    setElection((currentElection) => ({
      ...currentElection,
      status: 'ended',
      showResults: true,
    }));
  }

  function toggleResults() {
    if (!votingIsEnded) return;

    setElection((currentElection) => ({
      ...currentElection,
      showResults: !currentElection.showResults,
    }));
  }

  function resetVoting() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }

    setElection(createInitialElection());
    resetRouteFlow();
    setConfirmReset(false);
  }

  return (
    <main className={`app app--${routeName}`}>
      {!routeConfig && (
        <section className="hero">
          <div className="hero__content">
            <p className="eyebrow">Gowtham Model School</p>
            <h1>Leadership Voting</h1>
            <p>Open /boy or /girl from the address bar.</p>
          </div>
        </section>
      )}

      {routeConfig ? (
        <RouteVoting
          activePosition={activePosition}
          activeStep={activeStep}
          countdown={countdown}
          routeComplete={routeComplete}
          routePositions={routePositions}
          routeSelections={routeSelections}
          votingIsEnded={votingIsEnded}
          votingIsOpen={votingIsOpen}
          votingIsPaused={votingIsPaused}
          onVote={voteForCandidate}
        />
      ) : (
        <RouteChooser />
      )}

      {votingIsEnded && election.showResults && <ResultsBoard election={election} />}

      <AdminDrawer
        adminOpen={adminOpen}
        adminPin={adminPin}
        adminUnlocked={adminUnlocked}
        confirmReset={confirmReset}
        election={election}
        pinError={pinError}
        votingIsEnded={votingIsEnded}
        votingIsPaused={votingIsPaused}
        onEndVoting={endVoting}
        onPauseOrResume={pauseOrResumeVoting}
        onResetVoting={resetVoting}
        onSetAdminOpen={setAdminOpen}
        onSetAdminPin={setAdminPin}
        onToggleResults={toggleResults}
        onUnlockAdmin={unlockAdmin}
      />
    </main>
  );
}

function RouteChooser() {
  return (
    <section className="route-chooser" aria-label="Choose voting route">
      <p className="eyebrow">Route Required</p>
      <h2>Use the address bar to open /boy or /girl.</h2>
    </section>
  );
}

function RouteVoting({
  activePosition,
  activeStep,
  countdown,
  routeComplete,
  routePositions,
  routeSelections,
  votingIsEnded,
  votingIsOpen,
  votingIsPaused,
  onVote,
}) {
  if (routeComplete) {
    return (
      <section className="recorded-screen" aria-live="polite">
        <p className="eyebrow">Vote Recorded</p>
        <h2>Thank you. Next voter starts in {countdown} seconds.</h2>
      </section>
    );
  }

  return (
    <section className="route-ballot" aria-label="Voting ballot">
      <div className="route-progress">
        {routePositions.map((position, index) => {
          const done = Boolean(routeSelections[position.id]);
          const active = index === activeStep;

          return (
            <span
              className={[
                'route-progress__step',
                done ? 'done' : '',
                active ? 'active' : '',
              ].join(' ')}
              key={position.id}
            >
              {position.title}
            </span>
          );
        })}
      </div>

      {votingIsPaused && <div className="notice">Voting is paused.</div>}
      {votingIsEnded && <div className="notice notice--danger">Voting has ended.</div>}

      <section className="position-stage">
        <div className="position-stage__head">
          <p className="eyebrow">Post {activeStep + 1} of {routePositions.length}</p>
          <h2>{activePosition.title}</h2>
        </div>

        <div className="stage-candidates">
          {activePosition.candidates.map((candidate) => (
            <article
              className="stage-candidate"
              key={candidate.id}
              style={{ '--accent': candidate.accent }}
            >
              <FlexibleImage
                className="stage-candidate__photo"
                source={candidate.photo}
                alt={`${candidate.name} portrait`}
              />
              <div className="symbol-block">
                <span>Symbol</span>
                {candidate.symbolImage && (
                  <FlexibleImage
                    className="symbol-block__image"
                    source={candidate.symbolImage}
                    alt={`${candidate.symbol} symbol`}
                  />
                )}
                <strong>{candidate.symbol}</strong>
              </div>
              <div className="stage-candidate__name">
                <h3>{candidate.name}</h3>
                <small>{activePosition.title}</small>
              </div>
              <button type="button" onClick={() => onVote(candidate.id)} disabled={!votingIsOpen}>
                Vote
              </button>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function AdminDrawer({
  adminOpen,
  adminPin,
  adminUnlocked,
  confirmReset,
  election,
  pinError,
  votingIsEnded,
  votingIsPaused,
  onEndVoting,
  onPauseOrResume,
  onResetVoting,
  onSetAdminOpen,
  onSetAdminPin,
  onToggleResults,
  onUnlockAdmin,
}) {
  return (
    <section className={`admin-drawer ${adminOpen ? 'admin-drawer--open' : ''}`}>
      <button
        className="admin-drawer__toggle"
        type="button"
        onClick={() => onSetAdminOpen((open) => !open)}
      >
        Admin
      </button>

      {adminOpen && (
        <div className="admin-panel">
          {!adminUnlocked ? (
            <>
              <p className="eyebrow">Protected Controls</p>
              <label htmlFor="adminPin">Admin PIN</label>
              <div className="pin-row">
                <input
                  id="adminPin"
                  type="password"
                  inputMode="numeric"
                  value={adminPin}
                  onChange={(event) => onSetAdminPin(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onUnlockAdmin();
                  }}
                />
                <button type="button" onClick={onUnlockAdmin}>
                  Unlock
                </button>
              </div>
              {pinError && <small className="pin-error">{pinError}</small>}
            </>
          ) : (
            <>
              <div className="admin-panel__head">
                <div>
                  <p className="eyebrow">Admin Controls</p>
                  <h2>No. of Voters: {election.totalBallots}</h2>
                </div>
                <span>{election.status}</span>
              </div>

              <div className="admin-actions">
                <button type="button" onClick={onEndVoting} disabled={votingIsEnded}>
                  End Voting
                </button>
                <button type="button" onClick={onPauseOrResume} disabled={votingIsEnded}>
                  {votingIsPaused ? 'Resume Voting' : 'Pause Voting'}
                </button>
                <button type="button" onClick={onToggleResults} disabled={!votingIsEnded}>
                  {election.showResults ? 'Hide Results' : 'Show Results'}
                </button>
                <button className="danger-button" type="button" onClick={onResetVoting}>
                  {confirmReset ? 'Confirm Reset' : 'Reset Voting'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function ResultsBoard({ election }) {
  return (
    <section className="results-board" aria-label="Election results">
      <div className="results-board__head">
        <p className="eyebrow">Final Results</p>
        <h2>Winners by Post</h2>
      </div>

      <div className="results-grid">
        {positions.map((position) => {
          const totalVotes = position.candidates.reduce(
            (total, candidate) => total + election.votes[position.id][candidate.id],
            0,
          );
          const sortedCandidates = [...position.candidates].sort(
            (first, second) =>
              election.votes[position.id][second.id] - election.votes[position.id][first.id],
          );
          const winner = sortedCandidates[0];
          const isTie =
            totalVotes > 0 &&
            election.votes[position.id][sortedCandidates[0].id] ===
              election.votes[position.id][sortedCandidates[1].id];

          return (
            <article className="result-card" key={position.id}>
              <p className="eyebrow">{position.title}</p>
              <h3>
                {totalVotes === 0
                  ? 'No votes recorded'
                  : isTie
                    ? 'Tie'
                    : `${winner.name} won as ${position.title}`}
              </h3>

              <div className="result-list">
                {position.candidates.map((candidate) => {
                  const votes = election.votes[position.id][candidate.id];
                  const percentage = totalVotes ? Math.round((votes / totalVotes) * 100) : 0;
                  const isWinner = !isTie && totalVotes > 0 && candidate.id === winner.id;

                  return (
                    <div className="result-row" key={candidate.id}>
                      <div className="result-row__top">
                        <strong>{candidate.name}</strong>
                        {isWinner && <span>Winner</span>}
                      </div>
                      <div className="meter">
                        <span
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: candidate.accent,
                          }}
                        />
                      </div>
                      <small>
                        {percentage}% - {votes} votes
                      </small>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default App;
