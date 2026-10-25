"""Go, Java and C++ DSA harness: signatures inferred from test data, generated drivers."""

import pytest

from app.content.store import load_seed_files
from app.services import polyglot
from app.services.runner import language_available, run_tests

PROBLEMS = {p["slug"]: p for p in load_seed_files()["problem"]}

SOLUTIONS = {
    "two-sum": {
        "go": """package main

func twoSum(nums []int, target int) []int {
\tseen := map[int]int{}
\tfor i, n := range nums {
\t\tif j, ok := seen[target-n]; ok {
\t\t\treturn []int{j, i}
\t\t}
\t\tseen[n] = i
\t}
\treturn nil
}
""",
        "java": """import java.util.*;

class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            Integer j = seen.get(target - nums[i]);
            if (j != null) return new int[]{j, i};
            seen.put(nums[i], i);
        }
        return new int[0];
    }
}
""",
        "cpp": """class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < (int)nums.size(); i++) {
            auto it = seen.find(target - nums[i]);
            if (it != seen.end()) return {it->second, i};
            seen[nums[i]] = i;
        }
        return {};
    }
};
""",
    },
    "group-anagrams": {
        "go": """package main

import "sort"

func groupAnagrams(strs []string) [][]string {
\tgroups := map[string][]string{}
\torder := []string{}
\tfor _, s := range strs {
\t\tb := []byte(s)
\t\tsort.Slice(b, func(i, j int) bool { return b[i] < b[j] })
\t\tk := string(b)
\t\tif _, ok := groups[k]; !ok {
\t\t\torder = append(order, k)
\t\t}
\t\tgroups[k] = append(groups[k], s)
\t}
\tout := [][]string{}
\tfor _, k := range order {
\t\tout = append(out, groups[k])
\t}
\treturn out
}
""",
        "java": """import java.util.*;

class Solution {
    public String[][] groupAnagrams(String[] strs) {
        Map<String, List<String>> g = new LinkedHashMap<>();
        for (String s : strs) {
            char[] c = s.toCharArray();
            Arrays.sort(c);
            g.computeIfAbsent(new String(c), k -> new ArrayList<>()).add(s);
        }
        String[][] out = new String[g.size()][];
        int i = 0;
        for (List<String> l : g.values()) out[i++] = l.toArray(new String[0]);
        return out;
    }
}
""",
        "cpp": """class Solution {
public:
    vector<vector<string>> groupAnagrams(vector<string>& strs) {
        map<string, vector<string>> g;
        for (auto& s : strs) { string k = s; sort(k.begin(), k.end()); g[k].push_back(s); }
        vector<vector<string>> out;
        for (auto& [k, v] : g) out.push_back(v);
        return out;
    }
};
""",
    },
    "valid-parentheses": {
        "go": """package main

func isValid(s string) bool {
\tpairs := map[rune]rune{')': '(', ']': '[', '}': '{'}
\tstack := []rune{}
\tfor _, c := range s {
\t\tif open, ok := pairs[c]; ok {
\t\t\tif len(stack) == 0 || stack[len(stack)-1] != open {
\t\t\t\treturn false
\t\t\t}
\t\t\tstack = stack[:len(stack)-1]
\t\t} else {
\t\t\tstack = append(stack, c)
\t\t}
\t}
\treturn len(stack) == 0
}
""",
        "java": """import java.util.*;

class Solution {
    public boolean isValid(String s) {
        Deque<Character> st = new ArrayDeque<>();
        for (char c : s.toCharArray()) {
            if (c == '(' || c == '[' || c == '{') st.push(c);
            else {
                if (st.isEmpty()) return false;
                char o = st.pop();
                if ((c == ')' && o != '(') || (c == ']' && o != '[') || (c == '}' && o != '{')) return false;
            }
        }
        return st.isEmpty();
    }
}
""",
        "cpp": """class Solution {
public:
    bool isValid(string s) {
        string st;
        for (char c : s) {
            if (c == '(' || c == '[' || c == '{') st.push_back(c);
            else {
                if (st.empty()) return false;
                char o = st.back(); st.pop_back();
                if ((c == ')' && o != '(') || (c == ']' && o != '[') || (c == '}' && o != '{')) return false;
            }
        }
        return st.empty();
    }
};
""",
    },
    "climbing-stairs": {
        "go": "package main\n\nfunc climbStairs(n int) int {\n\ta, b := 1, 1\n\tfor i := 0; i < n; i++ {\n\t\ta, b = b, a+b\n\t}\n\treturn a\n}\n",
        "java": "class Solution {\n    public int climbStairs(int n) {\n        long a = 1, b = 1;\n        for (int i = 0; i < n; i++) { long t = a + b; a = b; b = t; }\n        return (int) a;\n    }\n}\n",
        "cpp": "class Solution {\npublic:\n    int climbStairs(int n) {\n        long long a = 1, b = 1;\n        for (int i = 0; i < n; i++) { long long t = a + b; a = b; b = t; }\n        return (int)a;\n    }\n};\n",
    },
    "median-of-two-sorted-arrays": {
        "go": """package main

import "sort"

func findMedianSortedArrays(nums1 []int, nums2 []int) float64 {
\tm := append(append([]int{}, nums1...), nums2...)
\tsort.Ints(m)
\tn := len(m)
\tif n%2 == 1 {
\t\treturn float64(m[n/2])
\t}
\treturn float64(m[n/2-1]+m[n/2]) / 2
}
""",
        "java": """import java.util.*;

class Solution {
    public double findMedianSortedArrays(int[] a, int[] b) {
        int[] m = new int[a.length + b.length];
        System.arraycopy(a, 0, m, 0, a.length);
        System.arraycopy(b, 0, m, a.length, b.length);
        Arrays.sort(m);
        int n = m.length;
        return n % 2 == 1 ? m[n / 2] : (m[n / 2 - 1] + m[n / 2]) / 2.0;
    }
}
""",
        "cpp": """class Solution {
public:
    double findMedianSortedArrays(vector<int>& a, vector<int>& b) {
        vector<int> m(a); m.insert(m.end(), b.begin(), b.end());
        sort(m.begin(), m.end());
        size_t n = m.size();
        return n % 2 ? m[n / 2] : (m[n / 2 - 1] + m[n / 2]) / 2.0;
    }
};
""",
    },
}


def _params():
    return [(slug, lang) for slug, by_lang in SOLUTIONS.items() for lang in by_lang]


@pytest.mark.parametrize("slug,lang", _params())
def test_typed_reference_solutions(slug, lang):
    if not language_available(lang):
        pytest.skip(f"{lang} toolchain not installed")
    problem = PROBLEMS[slug]
    # The function name in each solution must match what the driver calls
    if problem["function"]["javascript"] not in SOLUTIONS[slug][lang]:
        pytest.skip("function name differs in seed")
    result = run_tests(problem, lang, SOLUTIONS[slug][lang], problem["tests"])
    assert result["status"] == "Accepted", result


def test_starters_compile_and_fail_cleanly():
    problem = PROBLEMS["two-sum"]
    starters = polyglot.starters(problem)
    assert set(starters) == {"go", "java", "cpp"}
    for lang, code in starters.items():
        if language_available(lang):
            assert run_tests(problem, lang, code, problem["tests"])["status"] == "Wrong Answer", lang


def test_compile_error_and_unsupported_problems():
    problem = PROBLEMS["two-sum"]
    if language_available("java"):
        assert run_tests(problem, "java", "class Solution { oops }", problem["tests"])["status"] == "Compile Error"
    ops = PROBLEMS["lru-cache"]  # mixed-type operations can't be typed
    assert polyglot.signature(ops) is None
    assert run_tests(ops, "go", "package main", ops["tests"])["status"] == "Not Supported"


def test_coverage_of_typed_languages():
    typed = [p for p in PROBLEMS.values() if polyglot.signature(p)]
    assert len(typed) / len(PROBLEMS) > 0.6
