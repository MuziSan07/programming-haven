"""Company Prep Paths.

Stages reflect each network's publicly described screening process. Processes change, so the
UI shows a disclaimer. `module` links a stage to the part of the platform that trains it.
"""

DISCLAIMER = ("Based on publicly available descriptions of each company's screening process. "
              "Processes change over time — always check the company's official site.")


def stage(title, description, module, tip):
    return {"title": title, "description": description, "module": module, "tip": tip}


COMPANY_PATHS = [
    {
        "slug": "toptal", "name": "Toptal", "tagline": "The famously selective freelance network",
        "accent": "#3b82f6", "focus": ["English", "Algorithms", "Live coding", "Test project"],
        "stages": [
            stage("Language & personality interview",
                  "A conversation with a recruiter assessing English, communication and professionalism.",
                  "interview:english", "Speak in structured answers: context, action, result."),
            stage("Timed algorithm test",
                  "An online coding test (commonly Codility) with algorithm problems under time pressure.",
                  "test:algorithms-sprint", "Practise edge cases — hidden tests decide your score."),
            stage("Live technical screening",
                  "Solve problems live with a senior engineer while explaining your thinking.",
                  "interview:technical", "Think aloud. Silence is the most common reason for failing live rounds."),
            stage("Test project", "A realistic multi-day project reviewed for architecture and code quality.",
                  "dsa", "Ship tests, a README and clean commits — reviewers read everything."),
            stage("Continued excellence", "Ongoing quality standards once you join the network.",
                  "learn", "Keep your skills sharp with daily lessons."),
        ],
    },
    {
        "slug": "turing", "name": "Turing", "tagline": "AI-matched remote jobs with US companies",
        "accent": "#8b5cf6", "focus": ["Stack MCQs", "Coding challenge", "Technical interview", "Soft skills"],
        "stages": [
            stage("Profile & stack selection", "Build your profile and choose the tech stacks you'll be vetted on.",
                  "learn", "Pick 1–2 stacks you can defend in depth rather than five you know lightly."),
            stage("Technical knowledge tests", "Timed multiple-choice tests on your chosen languages and frameworks.",
                  "test:python-dev-assessment", "Read every option — trick questions target common misconceptions."),
            stage("Coding challenge", "A timed algorithmic problem solved in an online editor.",
                  "dsa", "Aim for a correct solution first, then optimise."),
            stage("Technical interview", "A deeper interview on your experience, design choices and trade-offs.",
                  "interview:technical", "Prepare two project stories with measurable impact."),
            stage("Soft skills & English", "Communication and remote-work readiness.",
                  "interview:behavioral", "Show async-communication habits: documentation, updates, ownership."),
        ],
    },
    {
        "slug": "lemon-io", "name": "Lemon.io", "tagline": "Vetted developers for startups",
        "accent": "#eab308", "focus": ["Profile review", "English call", "Live coding", "Startup mindset"],
        "stages": [
            stage("Profile & CV review", "Experience, stack and seniority are checked against startup demand.",
                  "learn", "Lead with shipped products and the business impact of your work."),
            stage("Soft skills & English call", "A recruiter call on communication, English and motivation.",
                  "interview:english", "Practise describing your projects clearly in two minutes."),
            stage("Technical interview with live coding",
                  "A senior developer reviews your skills and watches you solve a practical task.",
                  "interview:technical", "Narrate trade-offs: why this data structure, what you'd test."),
            stage("Practical problem solving", "Algorithmic or practical coding tasks.", "dsa",
                  "Startups value pragmatic, readable solutions over clever ones."),
        ],
    },
    {
        "slug": "a-team", "name": "A.Team", "tagline": "Elite product builders on mission-driven teams",
        "accent": "#ec4899", "focus": ["Portfolio", "Product thinking", "Experience interview"],
        "stages": [
            stage("Application & portfolio", "Your track record, products built and impact are reviewed.",
                  "learn", "Quantify outcomes: users, revenue, performance gains."),
            stage("Experience interview", "A conversation with a builder about your past work and how you lead.",
                  "interview:behavioral", "Prepare stories about leading, unblocking teams and owning outcomes."),
            stage("Technical deep dive", "Architecture and decision-making on real projects.",
                  "interview:technical", "Be ready to whiteboard a system you built and what you'd change."),
        ],
    },
    {
        "slug": "braintrust", "name": "Braintrust", "tagline": "User-owned talent network",
        "accent": "#10b981", "focus": ["AI interview", "Skill verification", "Client interviews"],
        "stages": [
            stage("Profile & application", "Create a detailed profile with skills and work history.",
                  "learn", "Match keywords in your profile to the roles you want."),
            stage("AI-led screening interview", "An AI-driven interview on your experience and skills.",
                  "interview:technical", "Our AI interviewer is the closest practice you'll get."),
            stage("Skill verification", "Technical assessments for the skills you claim.",
                  "test:algorithms-sprint", "Only list skills you can prove under test conditions."),
            stage("Client interviews", "Interviews directly with the hiring company.",
                  "interview:behavioral", "Research the client and prepare questions for them."),
        ],
    },
    {
        "slug": "remote-us-uk-eu", "name": "Remote US / UK / EU", "tagline": "Direct remote roles at product companies",
        "accent": "#f97316", "focus": ["Recruiter screen", "Online assessment", "Technical rounds", "Culture fit"],
        "stages": [
            stage("Recruiter screen", "A 20–30 minute call on background, motivation, salary and timezone overlap.",
                  "interview:english", "Have a crisp answer to 'Tell me about yourself' under 90 seconds."),
            stage("Online assessment or take-home", "HackerRank / Codility-style test or a small project.",
                  "test:algorithms-sprint", "Time-box take-homes and document what you'd do with more time."),
            stage("Technical interviews", "Two to three rounds: coding, debugging and domain knowledge.",
                  "interview:technical", "Clarify requirements before coding — interviewers score this."),
            stage("System design (mid / senior)", "Design a scalable service and discuss trade-offs.",
                  "interview:technical", "Cover requirements, API, data model, scaling and failure modes."),
            stage("Behavioural & culture", "Values, collaboration, conflict and remote-work habits.",
                  "interview:behavioral", "Use the STAR format and pick stories with real tension."),
        ],
    },
]

COMPANY_PATHS_BY_SLUG = {p["slug"]: p for p in COMPANY_PATHS}
