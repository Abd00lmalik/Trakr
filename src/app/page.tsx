const sampleRequest = {
  user: {
    name: "Amina",
    headline: "Frontend developer interested in Web3 public goods",
    skills: ["React", "TypeScript", "Solidity basics", "Technical writing"],
    experienceLevel: "early-career",
    location: "Lagos, Nigeria",
    goals: ["win a hackathon", "earn grant funding", "find remote builder roles"],
    interests: ["web3", "AI tools", "open source"],
  },
  filters: {
    categories: ["hackathon", "grant", "web3_bounty"],
    remote: true,
  },
};

export default function Home() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">A2MCP Opportunity Companion</p>
        <h1>Trakr</h1>
        <p>
          Trakr accepts a user profile or resume text and returns ranked,
          explainable opportunity recommendations with missing-skill analysis,
          action guidance, and a learning roadmap.
        </p>
      </section>

      <section className="grid" aria-label="Service surfaces">
        <article className="panel">
          <h2>POST /api/a2mcp/recommend</h2>
          <p>
            Main agent-facing endpoint for opportunity matching and personalized
            recommendation output.
          </p>
        </article>
        <article className="panel">
          <h2>GET /api/a2mcp</h2>
          <p>
            Public metadata describing service capabilities, schemas, and
            supported opportunity categories.
          </p>
        </article>
        <article className="panel">
          <h2>GET /api/health</h2>
          <p>
            Runtime health for deploy checks, AI provider configuration, and
            PostgreSQL readiness.
          </p>
        </article>
      </section>

      <section className="section">
        <h2>Example Request</h2>
        <pre className="code">{JSON.stringify(sampleRequest, null, 2)}</pre>
      </section>
    </main>
  );
}
