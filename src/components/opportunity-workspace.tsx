"use client";

import Image from "next/image";
import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  ExternalLink,
  FileText,
  LoaderCircle,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  UploadCloud,
} from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  useEffect,
} from "react";
import type {
  RecommendationResponse,
  StructuredUserProfile,
} from "@/lib/types/opportunities";

type ResumeParseResponse = {
  fileName: string;
  contentType: string;
  resumeText: string;
  profileDraft: StructuredUserProfile;
};

type UploadState = "idle" | "uploading" | "parsing" | "complete" | "error";
type RecommendState = "idle" | "loading" | "error";
type ServiceState = "checking" | "online" | "unavailable";
type ExperienceLevel = NonNullable<
  StructuredUserProfile["experienceLevel"]
>;

const emptyProfile: StructuredUserProfile = {
  headline: "",
  bio: "",
  location: "",
  experienceLevel: "early-career",
  skills: [],
  interests: [],
  goals: [],
  education: [],
  workHistory: [],
  projects: [],
  certifications: [],
  links: [],
};

const experienceOptions: Array<{
  value: ExperienceLevel;
  label: string;
}> = [
  { value: "student", label: "Student" },
  { value: "beginner", label: "Beginner" },
  { value: "early-career", label: "Early career" },
  { value: "mid-level", label: "Mid-level" },
  { value: "senior", label: "Senior" },
  { value: "founder", label: "Founder" },
  { value: "creator", label: "Creator" },
];

function normalizeProfile(profile: StructuredUserProfile) {
  return {
    ...emptyProfile,
    ...profile,
    skills: profile.skills ?? [],
    interests: profile.interests ?? [],
    goals: profile.goals ?? [],
    education: profile.education ?? [],
    workHistory: profile.workHistory ?? [],
    projects: profile.projects ?? [],
    certifications: profile.certifications ?? [],
    links: profile.links ?? [],
  };
}

function parseList(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function formatDeadline(value: string | null) {
  if (!value) {
    return "Rolling";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function Step({
  number,
  label,
  active,
  complete,
}: {
  number: number;
  label: string;
  active: boolean;
  complete: boolean;
}) {
  return (
    <li className={`workspace-step ${active ? "is-active" : ""}`}>
      <span className={`step-marker ${complete ? "is-complete" : ""}`}>
        {complete ? <Check aria-hidden="true" size={15} /> : number}
      </span>
      <span>{label}</span>
    </li>
  );
}

function ListField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string[];
  placeholder: string;
  onChange: (items: string[]) => void;
}) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        value={value.join(", ")}
        placeholder={placeholder}
        onChange={(event) => onChange(parseList(event.target.value))}
      />
    </label>
  );
}

export function OpportunityWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] =
    useState<StructuredUserProfile>(emptyProfile);
  const [resumeText, setResumeText] = useState("");
  const [fileName, setFileName] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [recommendState, setRecommendState] =
    useState<RecommendState>("idle");
  const [recommendError, setRecommendError] = useState("");
  const [response, setResponse] =
    useState<RecommendationResponse | null>(null);
  const [serviceState, setServiceState] =
    useState<ServiceState>("checking");

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/health", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((result) => {
        setServiceState(result.ok ? "online" : "unavailable");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setServiceState("unavailable");
        }
      });

    return () => controller.abort();
  }, []);

  const hasProfile = Boolean(resumeText);
  const isWorking =
    uploadState === "uploading" ||
    uploadState === "parsing" ||
    recommendState === "loading";

  const profileSignalCount = useMemo(
    () =>
      profile.skills.length +
      profile.interests.length +
      profile.goals.length,
    [profile.goals.length, profile.interests.length, profile.skills.length],
  );

  function updateProfile<K extends keyof StructuredUserProfile>(
    key: K,
    value: StructuredUserProfile[K],
  ) {
    setProfile((current) => ({ ...current, [key]: value }));
    setResponse(null);
  }

  function handleResume(file?: File) {
    if (!file) {
      return;
    }

    const allowed =
      file.type === "application/pdf" ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.type === "text/plain" ||
      /\.(pdf|docx|txt)$/i.test(file.name);

    if (!allowed) {
      setUploadState("error");
      setUploadError("Upload a PDF, DOCX, or TXT resume.");
      return;
    }

    if (file.size > 2_500_000) {
      setUploadState("error");
      setUploadError("The resume must be 2.5 MB or smaller.");
      return;
    }

    const formData = new FormData();
    formData.append("resume", file);
    const request = new XMLHttpRequest();
    setFileName(file.name);
    setUploadProgress(0);
    setUploadError("");
    setResponse(null);
    setUploadState("uploading");

    request.open("POST", "/api/profile/parse-resume");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setUploadProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.upload.onload = () => setUploadState("parsing");
    request.onerror = () => {
      setUploadState("error");
      setUploadError("The upload could not be completed.");
    };
    request.onload = () => {
      let body: ResumeParseResponse | { message?: string };
      try {
        body = JSON.parse(request.responseText) as
          | ResumeParseResponse
          | { message?: string };
      } catch {
        body = { message: "The resume response could not be read." };
      }

      if (request.status < 200 || request.status >= 300) {
        setUploadState("error");
        setUploadError(
          "message" in body && body.message
            ? body.message
            : "The resume could not be parsed.",
        );
        return;
      }

      const parsed = body as ResumeParseResponse;
      setResumeText(parsed.resumeText);
      setProfile(normalizeProfile(parsed.profileDraft));
      setUploadProgress(100);
      setUploadState("complete");
    };
    request.send(formData);
  }

  async function generateRecommendations() {
    setRecommendState("loading");
    setRecommendError("");
    setResponse(null);

    try {
      const result = await fetch("/api/a2mcp/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: profile,
          resumeText,
          filters: {
            remote: true,
            limit: 5,
          },
        }),
      });
      const body = (await result.json()) as RecommendationResponse & {
        message?: string;
      };
      if (!result.ok) {
        throw new Error(body.message || "Recommendations could not be generated.");
      }

      setResponse(body);
      setRecommendState("idle");
      requestAnimationFrame(() => {
        document
          .getElementById("recommendations")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (error) {
      setRecommendState("error");
      setRecommendError(
        error instanceof Error
          ? error.message
          : "Recommendations could not be generated.",
      );
    }
  }

  function resetWorkspace() {
    setProfile(emptyProfile);
    setResumeText("");
    setFileName("");
    setUploadState("idle");
    setUploadProgress(0);
    setUploadError("");
    setRecommendState("idle");
    setRecommendError("");
    setResponse(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    handleResume(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleResume(event.dataTransfer.files?.[0]);
  }

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div className="brand">
          <Image
            src="/trakr-avatar.png"
            alt="Trakr"
            width={48}
            height={48}
            priority
          />
          <div>
            <h1>Trakr</h1>
            <p>Opportunity workspace</p>
          </div>
        </div>
        <div
          className={`service-status service-status-${serviceState}`}
          aria-live="polite"
        >
          <span aria-hidden="true" />
          {serviceState === "checking"
            ? "Checking A2MCP"
            : serviceState === "online"
              ? "A2MCP online"
              : "A2MCP unavailable"}
        </div>
      </header>

      <div className="workspace-layout">
        <aside className="workspace-rail" aria-label="Workspace progress">
          <p className="rail-label">Progress</p>
          <ol>
            <Step
              number={1}
              label="Resume"
              active={!hasProfile}
              complete={hasProfile}
            />
            <Step
              number={2}
              label="Profile"
              active={hasProfile && !response}
              complete={Boolean(response)}
            />
            <Step
              number={3}
              label="Matches"
              active={Boolean(response)}
              complete={Boolean(response)}
            />
          </ol>
          <div className="privacy-note">
            <ShieldCheck aria-hidden="true" size={18} />
            <span>Resume files are parsed in memory and never stored.</span>
          </div>
        </aside>

        <div className="workspace-content">
          <section className="workspace-section" aria-labelledby="resume-title">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Step 1</p>
                <h2 id="resume-title">Resume</h2>
              </div>
              {hasProfile ? (
                <button
                  type="button"
                  className="icon-button"
                  onClick={resetWorkspace}
                  title="Start with another resume"
                  aria-label="Start with another resume"
                  disabled={isWorking}
                >
                  <RefreshCw aria-hidden="true" size={18} />
                </button>
              ) : null}
            </div>

            <div
              className={`upload-zone ${isDragging ? "is-dragging" : ""} ${
                uploadState === "error" ? "has-error" : ""
              }`}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <input
                ref={inputRef}
                id="resume-upload"
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={handleFileInput}
                disabled={isWorking}
              />
              <label htmlFor="resume-upload">
                <span className="upload-icon">
                  {uploadState === "complete" ? (
                    <CheckCircle2 aria-hidden="true" size={26} />
                  ) : (
                    <UploadCloud aria-hidden="true" size={26} />
                  )}
                </span>
                <span className="upload-title">
                  {fileName || "Drop your resume here"}
                </span>
                <span className="upload-meta">
                  {uploadState === "complete"
                    ? "Profile draft ready"
                    : "PDF, DOCX, or TXT up to 2.5 MB"}
                </span>
              </label>

              {uploadState === "uploading" || uploadState === "parsing" ? (
                <div className="upload-progress" aria-live="polite">
                  <div className="progress-track">
                    <span style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <span>
                    {uploadState === "parsing"
                      ? "Generating profile..."
                      : `Uploading ${uploadProgress}%`}
                  </span>
                </div>
              ) : null}

              {uploadState === "error" ? (
                <p className="inline-error" role="alert">
                  <AlertCircle aria-hidden="true" size={17} />
                  {uploadError}
                </p>
              ) : null}
            </div>
          </section>

          {hasProfile ? (
            <section
              className="workspace-section profile-section"
              aria-labelledby="profile-title"
            >
              <div className="section-heading">
                <div>
                  <p className="section-kicker">Step 2</p>
                  <h2 id="profile-title">Review profile</h2>
                </div>
                <span className="signal-count">
                  {profileSignalCount} signals
                </span>
              </div>

              <div className="profile-form">
                <label className="field field-wide" htmlFor="headline">
                  <span>Headline</span>
                  <input
                    id="headline"
                    value={profile.headline ?? ""}
                    onChange={(event) =>
                      updateProfile("headline", event.target.value)
                    }
                    placeholder="Your professional focus"
                  />
                </label>

                <label className="field" htmlFor="location">
                  <span>Location</span>
                  <input
                    id="location"
                    value={profile.location ?? ""}
                    onChange={(event) =>
                      updateProfile("location", event.target.value)
                    }
                    placeholder="City, country or Remote"
                  />
                </label>

                <label className="field" htmlFor="experience-level">
                  <span>Experience</span>
                  <select
                    id="experience-level"
                    value={profile.experienceLevel ?? "early-career"}
                    onChange={(event) =>
                      updateProfile(
                        "experienceLevel",
                        event.target.value as ExperienceLevel,
                      )
                    }
                  >
                    {experienceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field field-wide" htmlFor="profile-summary">
                  <span>Profile summary</span>
                  <textarea
                    id="profile-summary"
                    value={profile.bio ?? ""}
                    onChange={(event) =>
                      updateProfile("bio", event.target.value)
                    }
                    rows={4}
                    placeholder="A concise summary of your experience and direction"
                  />
                </label>

                <ListField
                  id="skills"
                  label="Skills"
                  value={profile.skills}
                  placeholder="TypeScript, React, Python"
                  onChange={(value) => updateProfile("skills", value)}
                />
                <ListField
                  id="interests"
                  label="Interests"
                  value={profile.interests}
                  placeholder="AI, Web3, open source"
                  onChange={(value) => updateProfile("interests", value)}
                />
                <ListField
                  id="goals"
                  label="Goals"
                  value={profile.goals}
                  placeholder="Win a hackathon, find a fellowship"
                  onChange={(value) => updateProfile("goals", value)}
                />
              </div>

              <div className="profile-actions">
                <div>
                  <strong>Ready to match</strong>
                  <span>Uses your reviewed profile and resume context.</span>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  onClick={generateRecommendations}
                  disabled={isWorking || profile.skills.length === 0}
                >
                  {recommendState === "loading" ? (
                    <LoaderCircle
                      className="spin"
                      aria-hidden="true"
                      size={18}
                    />
                  ) : (
                    <Sparkles aria-hidden="true" size={18} />
                  )}
                  {recommendState === "loading"
                    ? "Finding matches"
                    : response
                      ? "Refresh matches"
                      : "Find matches"}
                  {recommendState !== "loading" ? (
                    <ArrowRight aria-hidden="true" size={17} />
                  ) : null}
                </button>
              </div>

              {recommendState === "error" ? (
                <p className="inline-error" role="alert">
                  <AlertCircle aria-hidden="true" size={17} />
                  {recommendError}
                </p>
              ) : null}
            </section>
          ) : null}

          {response ? (
            <section
              id="recommendations"
              className="workspace-section results-section"
              aria-labelledby="recommendations-title"
            >
              <div className="section-heading results-heading">
                <div>
                  <p className="section-kicker">Step 3</p>
                  <h2 id="recommendations-title">Your matches</h2>
                </div>
                <div className="ai-status">
                  <Sparkles aria-hidden="true" size={16} />
                  {response.aiStatus === "enhanced"
                    ? "Gemini enhanced"
                    : "Grounded fallback"}
                </div>
              </div>

              <div className="recommendation-list">
                {response.recommendations.map((recommendation) => {
                  const confidence = Math.round(
                    recommendation.opportunity.verificationConfidence * 100,
                  );
                  const canApply =
                    recommendation.recommendedAction === "Apply Now";

                  return (
                    <article
                      className="recommendation-card"
                      key={recommendation.opportunity.id}
                    >
                      <div className="recommendation-main">
                        <div className="recommendation-rank">
                          {recommendation.rank}
                        </div>
                        <div className="recommendation-copy">
                          <div className="recommendation-title-row">
                            <div>
                              <p className="opportunity-category">
                                {recommendation.opportunity.category.replace(
                                  /_/g,
                                  " ",
                                )}
                              </p>
                              <h3>{recommendation.opportunity.title}</h3>
                              <p className="organization">
                                {recommendation.opportunity.organization}
                              </p>
                            </div>
                            <span
                              className={`action-status ${
                                canApply ? "can-apply" : ""
                              }`}
                            >
                              {recommendation.recommendedAction}
                            </span>
                          </div>

                          <div className="opportunity-meta">
                            <span>
                              <MapPin aria-hidden="true" size={15} />
                              {recommendation.opportunity.location}
                            </span>
                            <span>
                              <Target aria-hidden="true" size={15} />
                              {formatDeadline(
                                recommendation.opportunity.deadline,
                              )}
                            </span>
                            <span>
                              <ShieldCheck aria-hidden="true" size={15} />
                              {recommendation.opportunity.publisherDomain}
                            </span>
                          </div>

                          <p className="reasoning">
                            {recommendation.reasoning}
                          </p>

                          <div className="recommendation-details">
                            <div>
                              <h4>Missing requirements</h4>
                              {recommendation.missingRequirements.length ? (
                                <ul className="detail-list">
                                  {recommendation.missingRequirements.map(
                                    (requirement) => (
                                      <li key={requirement}>
                                        <Circle
                                          aria-hidden="true"
                                          size={8}
                                          fill="currentColor"
                                        />
                                        {requirement}
                                      </li>
                                    ),
                                  )}
                                </ul>
                              ) : (
                                <p className="no-gaps">
                                  <CheckCircle2
                                    aria-hidden="true"
                                    size={16}
                                  />
                                  No major gaps detected
                                </p>
                              )}
                            </div>
                            <div>
                              <h4>Next actions</h4>
                              <ol className="next-actions">
                                {recommendation.nextSteps
                                  .slice(0, 3)
                                  .map((step, index) => (
                                    <li key={step}>
                                      <span>{index + 1}</span>
                                      {step}
                                    </li>
                                  ))}
                              </ol>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="recommendation-score">
                        <div className="score-block">
                          <span>Match</span>
                          <strong>{recommendation.matchScore}%</strong>
                          <div className="score-track">
                            <span
                              style={{
                                width: `${recommendation.matchScore}%`,
                              }}
                            />
                          </div>
                        </div>
                        <div className="score-block">
                          <span>Confidence</span>
                          <strong>{confidence}%</strong>
                          <div className="score-track confidence-track">
                            <span style={{ width: `${confidence}%` }} />
                          </div>
                        </div>
                        <a
                          className={`source-button ${
                            canApply ? "primary-source" : ""
                          }`}
                          href={recommendation.opportunity.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {canApply ? "Apply now" : "View source"}
                          <ExternalLink aria-hidden="true" size={16} />
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="action-plan">
                <div className="action-plan-heading">
                  <BriefcaseBusiness aria-hidden="true" size={20} />
                  <h3>Action plan</h3>
                </div>
                <div className="plan-columns">
                  <div>
                    <span>Now</span>
                    <ul>
                      {response.actionPlan.immediate.map((item) => (
                        <li key={item}>
                          <ChevronRight aria-hidden="true" size={15} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span>7 days</span>
                    <ul>
                      {response.actionPlan.sevenDayPlan.map((item) => (
                        <li key={item}>
                          <ChevronRight aria-hidden="true" size={15} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span>30 days</span>
                    <ul>
                      {response.actionPlan.thirtyDayPlan.map((item) => (
                        <li key={item}>
                          <ChevronRight aria-hidden="true" size={15} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
