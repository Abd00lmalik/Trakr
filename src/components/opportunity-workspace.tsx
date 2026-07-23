"use client";

import Image from "next/image";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Circle,
  ExternalLink,
  FileSearch,
  FileText,
  LoaderCircle,
  MapPin,
  MessageSquare,
  PenLine,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  UploadCloud,
  UserRound,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import type {
  CompanionConversation,
  OpportunityCompanionResponse,
  OpportunityIntakeRoute,
  RecommendationResponse,
  UserFacingService,
} from "@/lib/types/opportunities";

type UploadState = "idle" | "uploading" | "parsing" | "complete" | "error";
type ServiceState = "checking" | "online" | "unavailable";
type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

const serviceOptions: Array<{
  id: UserFacingService;
  label: string;
  description: string;
  icon: typeof Search;
  active: boolean;
}> = [
  {
    id: "opportunity_finding",
    label: "Opportunity Finding",
    description: "Find current opportunities that fit your goals and constraints.",
    icon: Search,
    active: true,
  },
  {
    id: "resume_benchmarking_optimization",
    label: "Resume Benchmarking & Optimization",
    description: "Compare your evidence with a specific target before rewriting.",
    icon: FileSearch,
    active: true,
  },
  {
    id: "resume_generation",
    label: "Resume Generation",
    description: "Create a truthful, target-specific document from verified facts.",
    icon: PenLine,
    active: true,
  },
];

const opportunityRoutes: Array<{
  id: OpportunityIntakeRoute;
  label: string;
  description: string;
  icon: typeof Search;
  message: string;
}> = [
  {
    id: "resume",
    label: "Use my resume or CV",
    description: "Extract evidence from a document for this session.",
    icon: FileText,
    message: "Use my resume or CV",
  },
  {
    id: "background",
    label: "Tell Trakr about my background",
    description: "Describe your experience naturally in one message.",
    icon: UserRound,
    message: "Tell Trakr about my background",
  },
  {
    id: "request",
    label: "Describe what I am looking for",
    description: "Start with a goal and add only important missing details.",
    icon: MessageSquare,
    message: "Describe what I am looking for",
  },
];

function formatDeadline(value: string | null) {
  if (!value) return "Rolling or unknown";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function operationForService(service: UserFacingService) {
  if (service === "resume_benchmarking_optimization") return "benchmark" as const;
  if (service === "resume_generation") return "generate_resume" as const;
  return "discover" as const;
}

function responseConversation(response: RecommendationResponse | null) {
  return (response as OpportunityCompanionResponse | null)?.conversation;
}

function ProfileSummary({
  conversation,
}: {
  conversation: CompanionConversation;
}) {
  const profile = conversation.profile.draft;
  const facts = [
    profile.headline,
    profile.location,
    profile.experienceLevel,
    ...profile.skills.slice(0, 8),
    ...profile.interests.slice(0, 6),
    ...profile.goals.slice(0, 4),
  ].filter(Boolean);

  if (!facts.length) return null;

  return (
    <section className="profile-summary" aria-labelledby="profile-summary-title">
      <div className="profile-summary-heading">
        <div>
          <p className="section-kicker">Session profile</p>
          <h2 id="profile-summary-title">What Trakr understood</h2>
        </div>
        <span className="signal-count">
          {conversation.profile.completenessScore}% complete
        </span>
      </div>
      <div className="fact-list">
        {facts.map((fact, index) => (
          <span className="fact-chip" key={`${fact}-${index}`}>
            {fact}
          </span>
        ))}
      </div>
      {conversation.profile.unknownFields.length ? (
        <p className="unknown-facts">
          Still unknown: {conversation.profile.unknownFields.join(", ")}.
          Optional details can be added later.
        </p>
      ) : (
        <p className="unknown-facts">
          Critical profile information is present for this session. Review or
          correct anything that looks wrong before continuing.
        </p>
      )}
    </section>
  );
}

function RecommendationResults({
  response,
}: {
  response: RecommendationResponse;
}) {
  const directOpportunities =
    response.directOpportunities ??
    response.recommendations.filter(
      (item) => item.recommendationState === "apply_now",
    );
  const explorePrograms = response.explorePrograms ?? [];
  const supportingResources = response.supportingResources ?? [];
  const hasActionPlan = [
    ...response.actionPlan.immediate,
    ...response.actionPlan.sevenDayPlan,
    ...response.actionPlan.thirtyDayPlan,
  ].length > 0;

  return (
    <section
      id="recommendations"
      className="workspace-section results-section"
      aria-labelledby="recommendations-title"
    >
      <div className="section-heading results-heading">
        <div>
          <p className="section-kicker">Opportunity Finding</p>
          <h2 id="recommendations-title">Verified direct opportunities</h2>
        </div>
        <div className="ai-status">
          <Sparkles aria-hidden="true" size={16} />
          {response.aiStatus === "enhanced"
            ? "AI-enhanced from grounded data"
            : "Deterministic grounded result"}
        </div>
      </div>

      {response.coverage?.interests.length ? (
        <div className="coverage-panel">
          <div className="coverage-heading">
            <ShieldCheck aria-hidden="true" size={18} />
            <div>
              <strong>Interest coverage</strong>
              <span>
                Trakr reports weak or missing categories instead of padding the
                list with poor matches.
              </span>
            </div>
          </div>
          <div className="coverage-list">
            {response.coverage.interests.map((item) => (
              <div className="coverage-row" key={item.interest}>
                <span>{item.interest}</span>
                <strong className={`coverage-${item.status}`}>
                  {item.status.replaceAll("_", " ")}
                </strong>
                <p>{item.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {response.categoryCoverage?.length ? (
        <div className="coverage-panel">
          <div className="coverage-heading">
            <Target aria-hidden="true" size={18} />
            <div>
              <strong>Requested category coverage</strong>
              <span>
                Only verified direct opportunities satisfy coverage.
              </span>
            </div>
          </div>
          <div className="coverage-list">
            {response.categoryCoverage.map((item) => (
              <div className="coverage-row" key={item.category}>
                <span>{item.category.replaceAll("_", " ")}</span>
                <strong className={`coverage-${item.status}`}>
                  {item.status.replaceAll("_", " ")}
                </strong>
                <p>{item.reason}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!directOpportunities.length ? (
        <div className="empty-results">
          <Target aria-hidden="true" size={20} />
          <div>
            <strong>No qualified matches yet</strong>
            <p>
              Trakr kept your constraints and did not substitute unrelated or
              lower-confidence opportunities. Add or change a constraint when
              you want to broaden the search.
            </p>
          </div>
        </div>
      ) : null}

      <div className="recommendation-list">
        {directOpportunities.map((recommendation) => {
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
                      className={`action-status ${canApply ? "can-apply" : ""}`}
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
                      {formatDeadline(recommendation.opportunity.deadline)}
                    </span>
                    <span>
                      <ShieldCheck aria-hidden="true" size={15} />
                      {recommendation.opportunity.publisherDomain}
                    </span>
                  </div>

                  <p className="reasoning">{recommendation.reasoning}</p>
                  <p className="provenance-note">
                    Eligibility:{" "}
                    {recommendation.eligibilitySummary ??
                      "Confirm on the official page."}{" "}
                    {recommendation.geographicEligibility ??
                      "Geographic eligibility requires confirmation."}
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
                          <CheckCircle2 aria-hidden="true" size={16} />
                          No major skill gaps detected
                        </p>
                      )}
                    </div>
                    <div>
                      <h4>Next actions</h4>
                      <ol className="next-actions">
                        {recommendation.nextSteps.slice(0, 3).map((step, index) => (
                          <li key={step}>
                            <span>{index + 1}</span>
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>

                  {recommendation.provenance ? (
                    <p className="provenance-note">
                      {recommendation.provenance.verificationStatus ===
                      "verified"
                        ? "Verified active source"
                        : "Directory or unverified source"}{" "}
                      from {recommendation.provenance.sourceName}. Freshness:{" "}
                      {recommendation.provenance.freshness}; deadline confidence:{" "}
                      {recommendation.provenance.deadlineConfidence}.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="recommendation-score">
                <div className="score-block">
                  <span>Match</span>
                  <strong>{recommendation.matchScore}%</strong>
                  <div className="score-track">
                    <span style={{ width: `${recommendation.matchScore}%` }} />
                  </div>
                </div>
                <div className="score-block">
                  <span>Source confidence</span>
                  <strong>{confidence}%</strong>
                  <div className="score-track confidence-track">
                    <span style={{ width: `${confidence}%` }} />
                  </div>
                </div>
                <a
                  className={`source-button ${canApply ? "primary-source" : ""}`}
                  href={
                    recommendation.officialUrl ??
                    recommendation.opportunity.canonicalUrl
                  }
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

      {explorePrograms.length ? (
        <div className="action-plan">
          <div className="action-plan-heading">
            <Search aria-hidden="true" size={20} />
            <h3>Explore programs and official directories</h3>
          </div>
          <ul className="detail-list">
            {explorePrograms.map((recommendation) => (
              <li key={recommendation.opportunity.id}>
                <ExternalLink aria-hidden="true" size={15} />
                <a
                  href={
                    recommendation.officialUrl ??
                    recommendation.opportunity.canonicalUrl
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {recommendation.opportunity.title}
                </a>
                <span>Explore</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {supportingResources.length ? (
        <div className="action-plan">
          <div className="action-plan-heading">
            <BookOpen aria-hidden="true" size={20} />
            <h3>Supporting resources</h3>
          </div>
          <ul className="detail-list">
            {supportingResources.map((recommendation) => (
              <li key={recommendation.opportunity.id}>
                <ExternalLink aria-hidden="true" size={15} />
                <a
                  href={
                    recommendation.officialUrl ??
                    recommendation.opportunity.canonicalUrl
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {recommendation.opportunity.title}
                </a>
                <span>Not an application opportunity</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasActionPlan ? (
        <div className="action-plan">
        <div className="action-plan-heading">
          <BriefcaseBusiness aria-hidden="true" size={20} />
          <h3>Action plan</h3>
        </div>
        <div className="plan-columns">
          {[
            ["Now", response.actionPlan.immediate],
            ["7 days", response.actionPlan.sevenDayPlan],
            ["30 days", response.actionPlan.thirtyDayPlan],
          ].map(([label, items]) => (
            <div key={label as string}>
              <span>{label as string}</span>
              <ul>
                {(items as string[]).map((item) => (
                  <li key={item}>
                    <ChevronRight aria-hidden="true" size={15} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        </div>
      ) : null}
    </section>
  );
}

function CapabilityResults({
  response,
}: {
  response: OpportunityCompanionResponse;
}) {
  const benchmark = response.capabilityResult?.resumeBenchmark;
  const optimization = response.capabilityResult?.resumeOptimization;
  const generation = response.capabilityResult?.resumeGeneration;
  if (!benchmark && !optimization && !generation) return null;

  return (
    <section className="workspace-section capability-results" aria-labelledby="capability-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">
            {generation ? "Resume Generation" : "Resume Benchmarking & Optimization"}
          </p>
          <h2 id="capability-title">
            {generation
              ? generation.title
              : optimization
                ? "Target-specific optimization"
                : "Diagnostic benchmark"}
          </h2>
        </div>
      </div>

      {benchmark ? (
        <>
          <div className="benchmark-summary">
            <div>
              <span>Alignment</span>
              <strong>{benchmark.overallAlignmentScore}%</strong>
            </div>
            <div>
              <span>Document readiness</span>
              <strong>{benchmark.atsReadinessScore}%</strong>
            </div>
            <div>
              <span>Eligibility</span>
              <strong>{benchmark.eligibility.status.replaceAll("_", " ")}</strong>
            </div>
          </div>
          <p className="capability-note">{benchmark.scoreMeaning}</p>
          <div className="capability-list">
            {benchmark.requirements.slice(0, 10).map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.requirement}</strong>
                  <span>{item.status.replaceAll("_", " ")}</span>
                </div>
                <p>{item.explanation}</p>
              </article>
            ))}
          </div>
        </>
      ) : null}

      {optimization ? (
        <>
          <p className="capability-note">{optimization.factualIntegrity}</p>
          <div className="capability-list">
            {optimization.prioritizedChanges.map((item, index) => (
              <article key={`${item.section}-${index}`}>
                <div>
                  <strong>{item.section}</strong>
                  <span>{item.priority}</span>
                </div>
                <p>{item.recommendation}</p>
              </article>
            ))}
          </div>
        </>
      ) : null}

      {generation ? (
        <>
          <div className="generated-meta">
            <span>{generation.documentType.replaceAll("_", " ")}</span>
            <span>{generation.locale}</span>
            <span>{generation.format.replaceAll("_", " ")}</span>
            {generation.pageLimit ? (
              <span>{generation.pageLimit} page limit</span>
            ) : null}
          </div>
          <p className="capability-note">{generation.documentTypeReason}</p>
          <div className="generated-document">
            {generation.sections.map((section) => (
              <section key={section.id}>
                <h3>{section.heading}</h3>
                <ul>
                  {section.items.map((item, index) => (
                    <li className={item.placeholder ? "is-placeholder" : ""} key={`${section.id}-${index}`}>
                      <span>{item.text}</span>
                      <small>
                        {item.placeholder
                          ? "Confirmation required"
                          : `${item.evidenceClaimIds.length} evidence link${
                              item.evidenceClaimIds.length === 1 ? "" : "s"
                            }`}
                      </small>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {generation.followUpQuestions.length ? (
            <div className="generation-questions">
              <h3>Details to confirm</h3>
              <ol>
                {generation.followUpQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ol>
            </div>
          ) : null}
          {generation.instructions.length ? (
            <div className="generation-questions">
              <h3>Document constraints</h3>
              <ol>
                {generation.instructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ol>
            </div>
          ) : null}
          <p className="capability-note">{generation.factualIntegrity}</p>
        </>
      ) : null}
    </section>
  );
}

export function OpportunityWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedService, setSelectedService] =
    useState<UserFacingService | null>(null);
  const [intakeRoute, setIntakeRoute] =
    useState<OpportunityIntakeRoute | undefined>();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [continuation, setContinuation] =
    useState<CompanionConversation["continuation"]>();
  const [response, setResponse] = useState<RecommendationResponse | null>(null);
  const [fileName, setFileName] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [consent, setConsent] = useState(false);
  const [serviceState, setServiceState] = useState<ServiceState>("checking");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { cache: "no-store", signal: controller.signal })
      .then((result) => setServiceState(result.ok ? "online" : "unavailable"))
      .catch(() => {
        if (!controller.signal.aborted) setServiceState("unavailable");
      });
    return () => controller.abort();
  }, []);

  const conversation = responseConversation(response);
  const isOpportunityFinding = selectedService === "opportunity_finding";
  const isWorking = isSending || uploadState === "uploading" || uploadState === "parsing";
  const showRoutes =
    isOpportunityFinding &&
    (!conversation ||
      conversation.state === "choose_profile_source" ||
      conversation.state === "awaiting_resume" ||
      conversation.state === "collecting_background" ||
      conversation.state === "collecting_request");

  const routeOptions = useMemo(() => {
    if (conversation?.choices?.length) {
      return opportunityRoutes.filter((route) =>
        conversation.choices?.some((choice) => choice.id === route.id),
      );
    }
    return opportunityRoutes;
  }, [conversation?.choices]);

  function appendMessage(next: AssistantMessage) {
    setMessages((current) => [...current, next]);
  }

  async function submitToAgent(input: {
    message?: string;
    displayUser?: string;
    operation?: "auto" | "discover" | "benchmark" | "optimize" | "generate_resume";
    intakeRoute?: OpportunityIntakeRoute;
    resumeText?: string;
    freshSession?: boolean;
  }) {
    if (isSending) return;
    const selectedOperation =
      input.operation ??
      (selectedService
        ? operationForService(selectedService)
        : "auto");
    const userMessage = input.message?.trim();
    if (userMessage || input.displayUser) {
      appendMessage({ role: "user", content: input.displayUser ?? userMessage ?? "" });
    }
    setIsSending(true);
    setRequestError("");

    try {
      const payload: Record<string, unknown> = {
        operation: selectedOperation,
      };
      if (userMessage) payload.message = userMessage;
      if (input.intakeRoute ?? intakeRoute) {
        payload.intakeRoute = input.intakeRoute ?? intakeRoute;
      }
      if (input.resumeText) {
        payload.resumeText = input.resumeText;
        payload.consent = {
          processPersonalData: consent,
          retention: "session_only",
          source: "explicit",
        };
      }
      if (continuation && !input.freshSession) {
        payload.continuation = continuation;
      }

      const result = await fetch("/api/a2mcp/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await result.json()) as
        | OpportunityCompanionResponse
        | { message?: string };
      if (!result.ok) {
        throw new Error(
          "message" in body && body.message
            ? body.message
            : "Trakr could not process that request.",
        );
      }

      const companionResponse = body as OpportunityCompanionResponse;
      setResponse(companionResponse);
      if (companionResponse.conversation) {
        setContinuation(companionResponse.conversation.continuation);
        setSelectedService(companionResponse.conversation.service);
        if (companionResponse.conversation.profileSource) {
          setIntakeRoute(companionResponse.conversation.profileSource);
        }
        appendMessage({
          role: "assistant",
          content: companionResponse.conversation.message,
        });
      }
      setMessage("");
      if (companionResponse.recommendations.length) {
        requestAnimationFrame(() => {
          document
            .getElementById("recommendations")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "Trakr could not process that request.",
      );
    } finally {
      setIsSending(false);
    }
  }

  function selectService(service: UserFacingService) {
    setSelectedService(service);
    setIntakeRoute(undefined);
    setResponse(null);
    setContinuation(undefined);
    setMessages([]);
    setRequestError("");
    if (service === "opportunity_finding") {
      void submitToAgent({ operation: "discover", freshSession: true });
    } else {
      void submitToAgent({
        operation: operationForService(service),
        freshSession: true,
      });
    }
  }

  function selectRoute(route: OpportunityIntakeRoute) {
    setIntakeRoute(route);
    const option = opportunityRoutes.find((item) => item.id === route);
    if (option) {
      void submitToAgent({
        message:
          route === "resume" ? "1" : route === "background" ? "2" : "3",
        displayUser: option.message,
        intakeRoute: route,
        operation: "discover",
      });
    }
  }

  function sendMessage() {
    const trimmed = message.trim();
    if (!trimmed) return;
    void submitToAgent({ message: trimmed });
  }

  function handleResume(file?: File) {
    if (!file) return;
    if (!consent) {
      setUploadState("error");
      setUploadError(
        "Confirm session-only processing before uploading a resume.",
      );
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
    formData.append("consent", "true");
    formData.append(
      "operation",
      selectedService ? operationForService(selectedService) : "discover",
    );
    formData.append("intakeRoute", "resume");
    if (continuation?.token) {
      formData.append("continuation", continuation.token);
    }
    const request = new XMLHttpRequest();
    setFileName(file.name);
    setUploadProgress(0);
    setUploadError("");
    setUploadState("uploading");
    request.open("POST", "/api/a2mcp/recommend");
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
      let body: OpportunityCompanionResponse | { message?: string };
      try {
        body = JSON.parse(request.responseText) as
          | OpportunityCompanionResponse
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
      const companionResponse = body as OpportunityCompanionResponse;
      setUploadProgress(100);
      setUploadState("complete");
      appendMessage({
        role: "user",
        content: "Resume uploaded for this session.",
      });
      setResponse(companionResponse);
      if (companionResponse.conversation) {
        setContinuation(companionResponse.conversation.continuation);
        setSelectedService(companionResponse.conversation.service);
        setIntakeRoute(
          companionResponse.conversation.profileSource ?? "resume",
        );
        appendMessage({
          role: "assistant",
          content: companionResponse.conversation.message,
        });
      }
    };
    request.send(formData);
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    handleResume(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleResume(event.dataTransfer.files?.[0]);
  }

  function resetWorkspace() {
    setSelectedService(null);
    setIntakeRoute(undefined);
    setMessage("");
    setMessages([]);
    setContinuation(undefined);
    setResponse(null);
    setFileName("");
    setUploadState("idle");
    setUploadProgress(0);
    setUploadError("");
    setRequestError("");
    setConsent(false);
    if (inputRef.current) inputRef.current.value = "";
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
            <p>AI Opportunity Companion</p>
          </div>
        </div>
        <div
          className={`service-status service-status-${serviceState}`}
          aria-live="polite"
        >
          <span aria-hidden="true" />
          {serviceState === "checking"
            ? "Checking service"
            : serviceState === "online"
              ? "Service online"
              : "Service unavailable"}
        </div>
      </header>

      <div className="workspace-layout">
        <aside className="workspace-rail" aria-label="Session status">
          <p className="rail-label">Session</p>
          <ol>
            <li className={`workspace-step ${!selectedService ? "is-active" : ""}`}>
              <span className="step-marker">1</span>
              <span>Choose an outcome</span>
            </li>
            <li
              className={`workspace-step ${
                selectedService ? "is-active" : ""
              }`}
            >
              <span className="step-marker">2</span>
              <span>Build context</span>
            </li>
            <li
              className={`workspace-step ${
                response?.recommendations.length ? "is-active" : ""
              }`}
            >
              <span className="step-marker">3</span>
              <span>Take action</span>
            </li>
          </ol>
          <div className="privacy-note">
            <ShieldCheck aria-hidden="true" size={18} />
            <span>
              Session context is caller-carried and expires. Resume files are
              processed for the current session only.
            </span>
          </div>
        </aside>

        <div className="workspace-content">
          <section className="workspace-section outcome-section">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Start with an outcome</p>
                <h2>What do you want Trakr to help with?</h2>
              </div>
              {selectedService ? (
                <button
                  type="button"
                  className="icon-button"
                  onClick={resetWorkspace}
                  title="Start a fresh session"
                  aria-label="Start a fresh session"
                  disabled={isWorking}
                >
                  <RefreshCw aria-hidden="true" size={18} />
                </button>
              ) : null}
            </div>

            <div className="service-grid">
              {serviceOptions.map((service) => {
                const Icon = service.icon;
                const selected = selectedService === service.id;
                return (
                  <button
                    type="button"
                    className={`service-choice ${selected ? "is-selected" : ""}`}
                    key={service.id}
                    onClick={() => selectService(service.id)}
                    disabled={isWorking}
                  >
                    <span className="service-choice-icon">
                      <Icon aria-hidden="true" size={21} />
                    </span>
                    <span className="service-choice-copy">
                      <strong>{service.label}</strong>
                      <span>{service.description}</span>
                    </span>
                    <ArrowRight aria-hidden="true" size={17} />
                    {!service.active ? (
                      <small>Service flow staged</small>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="composer-shell">
              <label htmlFor="message-composer">
                <span className="composer-label">Tell Trakr what you need</span>
                <span className="composer-hint">
                  You can start typing now. Trakr will route the request and
                  ask only for important missing information.
                </span>
              </label>
              <div className="composer-row">
                <textarea
                  id="message-composer"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="For example: Find remote AI internships for a student in Nigeria."
                  rows={3}
                  disabled={isWorking}
                />
                <button
                  type="button"
                  className="send-button"
                  onClick={sendMessage}
                  aria-label="Send message"
                  title="Send message"
                  disabled={isWorking || !message.trim()}
                >
                  {isSending ? (
                    <LoaderCircle className="spin" aria-hidden="true" size={19} />
                  ) : (
                    <Send aria-hidden="true" size={19} />
                  )}
                </button>
              </div>
            </div>
          </section>

          {selectedService === "opportunity_finding" && showRoutes ? (
            <section className="workspace-section intake-section" aria-labelledby="intake-title">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">Opportunity Finding</p>
                  <h2 id="intake-title">Choose your starting point</h2>
                </div>
              </div>
              <p className="section-intro">
                A resume is optional. Pick the route that is easiest for you,
                or use the message box above to describe your goal first.
              </p>
              <div className="route-grid">
                {routeOptions.map((route) => {
                  const Icon = route.icon;
                  return (
                    <button
                      type="button"
                      className={`route-choice ${
                        intakeRoute === route.id ? "is-selected" : ""
                      }`}
                      key={route.id}
                      onClick={() => selectRoute(route.id)}
                      disabled={isWorking}
                    >
                      <Icon aria-hidden="true" size={20} />
                      <span>
                        <strong>{route.label}</strong>
                        <small>{route.description}</small>
                      </span>
                      <ChevronRight aria-hidden="true" size={17} />
                    </button>
                  );
                })}
              </div>

              {intakeRoute === "resume" ||
              conversation?.state === "awaiting_resume" ? (
                <div className="resume-intake">
                  <div className="consent-row">
                    <input
                      id="session-consent"
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                    />
                    <label htmlFor="session-consent">
                      Allow Trakr to process this resume for this session only.
                    </label>
                  </div>
                  <div
                    className={`upload-zone ${
                      isDragging ? "is-dragging" : ""
                    } ${uploadState === "error" ? "has-error" : ""}`}
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
                      disabled={isWorking || !consent}
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
                          ? "Evidence extracted for this session"
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
                            ? "Extracting profile evidence..."
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
                </div>
              ) : null}
            </section>
          ) : null}

          {selectedService &&
          selectedService !== "opportunity_finding" ? (
            <section className="workspace-section intake-section" aria-labelledby="resume-service-intake">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">
                    {selectedService === "resume_generation"
                      ? "Resume Generation"
                      : "Resume Benchmarking & Optimization"}
                  </p>
                  <h2 id="resume-service-intake">Add existing application evidence</h2>
                </div>
              </div>
              <p className="section-intro">
                Upload a resume, CV, or text document, or describe verified facts in the message box. Trakr will ask for the target and only the missing evidence that matters.
              </p>
              <div className="resume-intake">
                <div className="consent-row">
                  <input
                    id="resume-service-consent"
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  <label htmlFor="resume-service-consent">
                    Allow Trakr to process this document for this session only.
                  </label>
                </div>
                <div
                  className={`upload-zone ${
                    isDragging ? "is-dragging" : ""
                  } ${uploadState === "error" ? "has-error" : ""}`}
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
                    id="resume-service-upload"
                    type="file"
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    onChange={handleFileInput}
                    disabled={isWorking || !consent}
                  />
                  <label htmlFor="resume-service-upload">
                    <span className="upload-icon">
                      {uploadState === "complete" ? (
                        <CheckCircle2 aria-hidden="true" size={26} />
                      ) : (
                        <UploadCloud aria-hidden="true" size={26} />
                      )}
                    </span>
                    <span className="upload-title">
                      {fileName || "Drop a resume or CV here"}
                    </span>
                    <span className="upload-meta">
                      {uploadState === "complete"
                        ? "Evidence extracted for this session"
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
                          ? "Extracting evidence..."
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
              </div>
            </section>
          ) : null}

          {messages.length ? (
            <section className="conversation-section" aria-label="Trakr conversation">
              {messages.map((item, index) => (
                <div className={`conversation-message ${item.role}`} key={`${item.role}-${index}`}>
                  <span className="conversation-role">
                    {item.role === "assistant" ? "Trakr" : "You"}
                  </span>
                  <p>{item.content}</p>
                </div>
              ))}
            </section>
          ) : null}

          {conversation ? <ProfileSummary conversation={conversation} /> : null}

          {response ? (
            <CapabilityResults
              response={response as OpportunityCompanionResponse}
            />
          ) : null}

          {requestError ? (
            <p className="inline-error request-error" role="alert">
              <AlertCircle aria-hidden="true" size={17} />
              {requestError}
            </p>
          ) : null}

          {response &&
          (response.recommendations.length > 0 ||
            Boolean(response.coverage?.requestedInterests.length)) ? (
            <RecommendationResults response={response} />
          ) : null}
        </div>
      </div>
    </main>
  );
}
