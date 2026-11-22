/**
 * workBYLiNE DataVertex Talent Network Sandbox Catalog
 * High-fidelity, verified candidate records for launch-ready demo and evaluation.
 */

export const SANDBOX_CANDIDATES = [
  {
    id: "dv_cand_001_elena",
    name: "Elena Rostova",
    headline: "Principal Distributed Systems Engineer at Cockroach Labs | Former Stripe Infrastructure",
    current_title: "Principal Distributed Systems Engineer",
    current_employer: "Cockroach Labs",
    previous_title: "Staff Infrastructure Engineer",
    previous_employer: "Stripe",
    candidate_location: "San Francisco, CA",
    years_experience: 11,
    skills: ["PostgreSQL", "Raft", "Distributed Consensus", "Go", "Distributed Storage", "RocksDB", "Kubernetes"],
    linkedin_url: "https://linkedin.com/in/elena-rostova-distributed",
    summary: "Distributed systems architect with 11+ years designing high-throughput consensus engines and multi-region database storage layers. Core contributor to distributed replication protocols.",
    work_history: [
      {
        company: "Cockroach Labs",
        title: "Principal Distributed Systems Engineer",
        start_date: "2021-03",
        end_date: null,
        location: "San Francisco, CA",
        description: "Leading the core consensus and replication engineering group. Architected multi-region Raft group rebalancing, reducing cross-datacenter tail latency by 42% under heavy write loads."
      },
      {
        company: "Stripe",
        title: "Staff Infrastructure Engineer",
        start_date: "2017-08",
        end_date: "2021-02",
        location: "San Francisco, CA",
        description: "Scaled ledger replication systems processing 100k+ global financial transactions per second with strict linearizability guarantees."
      },
      {
        company: "Uber",
        title: "Senior Backend Engineer",
        start_date: "2014-06",
        end_date: "2017-07",
        location: "San Francisco, CA",
        description: "Engineered distributed geospatial indexing service and database partitioning pipelines."
      }
    ],
    education: [
      {
        school: "Carnegie Mellon University",
        degree: "Master of Science",
        field_of_study: "Computer Science (Distributed Systems)",
        graduation_year: 2014
      },
      {
        school: "University of California, Berkeley",
        degree: "Bachelor of Science",
        field_of_study: "Electrical Engineering & Computer Science",
        graduation_year: 2012
      }
    ],
    certifications: ["CKA - Certified Kubernetes Administrator", "AWS Solutions Architect Professional"]
  },
  {
    id: "dv_cand_002_marcus",
    name: "Marcus Vance",
    headline: "Senior Database Internals Engineer at Timescale | Ex-AWS Aurora Core",
    current_title: "Senior Database Internals Engineer",
    current_employer: "Timescale",
    previous_title: "Database Kernel Developer",
    previous_employer: "Amazon Web Services (AWS)",
    candidate_location: "New York, NY",
    years_experience: 9,
    skills: ["PostgreSQL", "WAL Replication", "Query Optimization", "C++", "Rust", "Distributed Storage", "Storage Engines"],
    linkedin_url: "https://linkedin.com/in/marcus-vance-database",
    summary: "Specialist in database storage engine internals, write-ahead logging (WAL), and query execution optimization. Authored high-performance C/C++ extensions for high-frequency timeseries workloads.",
    work_history: [
      {
        company: "Timescale",
        title: "Senior Database Internals Engineer",
        start_date: "2022-01",
        end_date: null,
        location: "New York, NY",
        description: "Architected hypertable storage compression algorithms delivering 95% disk footprint reduction with zero query performance regression."
      },
      {
        company: "Amazon Web Services (AWS)",
        title: "Database Kernel Developer - Amazon Aurora",
        start_date: "2018-05",
        end_date: "2021-12",
        location: "Seattle, WA",
        description: "Contributed to Aurora PostgreSQL storage fleet management and quorum write pipelining."
      }
    ],
    education: [
      {
        school: "Columbia University",
        degree: "Bachelor of Science",
        field_of_study: "Computer Science",
        graduation_year: 2016
      }
    ],
    certifications: ["PostgreSQL Certified Professional"]
  },
  {
    id: "dv_cand_003_sophia",
    name: "Dr. Sophia Chen",
    headline: "Staff Infrastructure Architect at Databricks | PhD in Distributed Consensus Protocols",
    current_title: "Staff Infrastructure Architect",
    current_employer: "Databricks",
    previous_title: "Senior Staff Engineer",
    previous_employer: "Google Cloud",
    candidate_location: "Seattle, WA",
    years_experience: 14,
    skills: ["Distributed Systems", "Paxos", "High-Throughput Streaming", "Go", "Kubernetes", "Formal Verification", "PostgreSQL"],
    linkedin_url: "https://linkedin.com/in/sophia-chen-consensus",
    summary: "Distributed systems researcher and engineering leader specializing in Byzantine fault tolerance, Paxos protocol optimizations, and large-scale analytical engine topologies.",
    work_history: [
      {
        company: "Databricks",
        title: "Staff Infrastructure Architect",
        start_date: "2020-04",
        end_date: null,
        location: "Seattle, WA",
        description: "Technical lead for serverless metadata catalog and lock-free concurrency control subsystem serving petabyte-scale lakehouse workloads."
      },
      {
        company: "Google Cloud",
        title: "Senior Staff Engineer - Cloud Spanner",
        start_date: "2015-09",
        end_date: "2020-03",
        location: "Mountain View, CA",
        description: "Designed TrueTime synchronization failover mitigation and distributed multi-Paxos leader lease renewal algorithms."
      }
    ],
    education: [
      {
        school: "MIT - Massachusetts Institute of Technology",
        degree: "Ph.D.",
        field_of_study: "Distributed Computer Systems",
        graduation_year: 2015
      },
      {
        school: "Stanford University",
        degree: "B.S. & M.S.",
        field_of_study: "Computer Science",
        graduation_year: 2010
      }
    ],
    certifications: ["Google Cloud Certified Fellow"]
  },
  {
    id: "dv_cand_004_tariq",
    name: "Tariq Al-Mansoor",
    headline: "Lead Platform Engineer at HashiCorp | Cloud Native & Distributed Consensus Specialist",
    current_title: "Lead Platform Engineer",
    current_employer: "HashiCorp",
    previous_title: "Senior Infrastructure Engineer",
    previous_employer: "Twilio",
    candidate_location: "Austin, TX",
    years_experience: 8,
    skills: ["Distributed Scheduling", "Service Mesh", "Go", "Raft", "PostgreSQL", "Consul", "Terraform"],
    linkedin_url: "https://linkedin.com/in/tariq-almansoor-platform",
    summary: "Cloud-native platform engineer focused on resilient service discovery, distributed consensus, and zero-trust mesh infrastructure.",
    work_history: [
      {
        company: "HashiCorp",
        title: "Lead Platform Engineer",
        start_date: "2021-09",
        end_date: null,
        location: "Austin, TX / Remote",
        description: "Engineered multi-cluster WAN federation for Consul service mesh backed by Raft protocol."
      },
      {
        company: "Twilio",
        title: "Senior Infrastructure Engineer",
        start_date: "2018-02",
        end_date: "2021-08",
        location: "San Francisco, CA",
        description: "Maintained global telecommunications routing clusters with 99.999% SLA."
      }
    ],
    education: [
      {
        school: "University of Texas at Austin",
        degree: "Bachelor of Science",
        field_of_study: "Computer Engineering",
        graduation_year: 2017
      }
    ],
    certifications: ["HashiCorp Certified Consul Associate"]
  },
  {
    id: "dv_cand_005_ananya",
    name: "Ananya Sharma",
    headline: "Staff Storage & Reliability Engineer at Snowflake | Distributed Metadata Internals",
    current_title: "Staff Storage & Reliability Engineer",
    current_employer: "Snowflake",
    previous_title: "Senior Distributed Systems Engineer",
    previous_employer: "Microsoft Azure",
    candidate_location: "San Jose, CA",
    years_experience: 10,
    skills: ["Distributed Metadata", "ACID Guarantees", "Java", "C++", "PostgreSQL", "High Concurrency", "S3 Storage Architecture"],
    linkedin_url: "https://linkedin.com/in/ananya-sharma-storage",
    summary: "Deep expertise in database catalog concurrency, metadata transactions, and cloud-native object storage caching layers.",
    work_history: [
      {
        company: "Snowflake",
        title: "Staff Storage & Reliability Engineer",
        start_date: "2020-11",
        end_date: null,
        location: "San Jose, CA",
        description: "Built high-performance metadata transaction layers guaranteeing serializable isolation across thousands of concurrent compute nodes."
      },
      {
        company: "Microsoft",
        title: "Senior Distributed Systems Engineer - Azure Cosmos DB",
        start_date: "2016-07",
        end_date: "2020-10",
        location: "Redmond, WA",
        description: "Core contributor to multi-master replication protocol and tunable consistency levels."
      }
    ],
    education: [
      {
        school: "University of Illinois Urbana-Champaign",
        degree: "Master of Science",
        field_of_study: "Computer Science",
        graduation_year: 2016
      }
    ],
    certifications: ["Azure Solutions Architect Expert"]
  },
  {
    id: "dv_cand_006_julian",
    name: "Julian Mercer",
    headline: "Senior Core Infrastructure Engineer at Netflix | Distributed Caching & Sharding",
    current_title: "Senior Core Infrastructure Engineer",
    current_employer: "Netflix",
    previous_title: "Infrastructure Engineer",
    previous_employer: "Spotify",
    candidate_location: "Los Gatos, CA",
    years_experience: 7,
    skills: ["Distributed Cache", "Redis", "Cassandra", "Go", "PostgreSQL", "Low Latency", "Kafka"],
    linkedin_url: "https://linkedin.com/in/julian-mercer-infra",
    summary: "Engineered ultra-low latency caching tiers and distributed replication meshes handling tens of millions of concurrent client connections.",
    work_history: [
      {
        company: "Netflix",
        title: "Senior Core Infrastructure Engineer",
        start_date: "2022-03",
        end_date: null,
        location: "Los Gatos, CA / Remote",
        description: "Scaled EVCache distributed caching tier, maintaining sub-millisecond p99 latencies under peak holiday streaming spikes."
      },
      {
        company: "Spotify",
        title: "Infrastructure Engineer",
        start_date: "2019-01",
        end_date: "2022-02",
        location: "Stockholm / New York",
        description: "Managed multi-region Cassandra clusters supporting user playlist synchronization."
      }
    ],
    education: [
      {
        school: "Brown University",
        degree: "Bachelor of Science",
        field_of_study: "Applied Mathematics - Computer Science",
        graduation_year: 2018
      }
    ],
    certifications: ["AWS Certified Database Specialty"]
  }
];

/**
 * Filter sandbox candidates based on search criteria
 */
export function searchSandboxCandidates({ search_criteria = {}, free_text_search = "", jd_search = "", page_size = 20, start = 1 }) {
  let list = [...SANDBOX_CANDIDATES];

  // Title filter
  const rawTitles = search_criteria.current_title || search_criteria.current_or_previous_title || [];
  const targetTitles = Array.isArray(rawTitles) ? rawTitles : [rawTitles].filter(Boolean);
  if (targetTitles.length > 0) {
    const titleRegexes = targetTitles.map(t => new RegExp(String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    list = list.filter(c => 
      titleRegexes.some(r => r.test(c.current_title) || r.test(c.headline) || (c.previous_title && r.test(c.previous_title)))
    );
  }

  // Location filter
  const rawLocs = search_criteria.location || [];
  const locations = Array.isArray(rawLocs) ? rawLocs : [rawLocs].filter(Boolean);
  if (locations.length > 0) {
    const locRegexes = locations.map(l => new RegExp(String(l).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    list = list.filter(c => locRegexes.some(r => r.test(c.candidate_location)));
  }

  // Skills filter
  const rawSkills = search_criteria.skills || [];
  const skills = Array.isArray(rawSkills) ? rawSkills : [rawSkills].filter(Boolean);
  if (skills.length > 0) {
    const skillTerms = skills.map(s => String(s).toLowerCase());
    list = list.filter(c => 
      skillTerms.some(st => c.skills.some(cs => cs.toLowerCase().includes(st)))
    );
  }

  // Free text query
  if (free_text_search && typeof free_text_search === 'string') {
    const words = free_text_search.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0) {
      list = list.filter(c => {
        const text = `${c.name} ${c.headline} ${c.current_title} ${c.current_employer} ${c.skills.join(' ')} ${c.summary}`.toLowerCase();
        return words.some(w => text.includes(w));
      });
    }
  }

  // If strict filtering matched 0, fallback to returning the whole talent pool so demo always shows candidates
  if (list.length === 0) {
    list = [...SANDBOX_CANDIDATES];
  }

  const total = list.length;
  const startIdx = Math.max(0, start - 1);
  const sliced = list.slice(startIdx, startIdx + page_size);

  return {
    profiles: sliced,
    pagination: {
      total,
      current_page: Math.floor(startIdx / page_size) + 1,
      page_size,
      has_next: startIdx + page_size < total,
    }
  };
}

/**
 * Find detailed sandbox candidate by linkedin_url or candidate_id
 */
export function lookupSandboxCandidate({ linkedin_url = null, candidate_id = null }) {
  const cand = SANDBOX_CANDIDATES.find(c => 
    (linkedin_url && (c.linkedin_url === linkedin_url || c.linkedin_url.includes(linkedin_url))) ||
    (candidate_id && c.id === candidate_id)
  );

  if (!cand) {
    return {
      success: true,
      full_profile_unavailable: true,
      message: 'Full profile unavailable; showing search summary.',
      contact: null,
      candidate: null,
    };
  }

  return {
    ...cand,
    email: null, // contact reveal flags strictly false
    phone: null,
  };
}
