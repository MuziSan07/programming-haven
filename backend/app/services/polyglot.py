"""DSA support for typed languages (Go, Java, C++).

Problems are authored with JSON test data and Python/JavaScript solutions. For typed languages we infer a
signature from the test data (e.g. a list of ints -> int[] / []int / vector<int>), generate a starter and a
driver that parses the JSON tests, calls the user's function and prints JSON results in the same format as
the Python/JS harness. Problems whose data can't be typed simply (mixed lists, nulls) stay Python/JS only.
"""

import json
import re

TYPED_LANGUAGES = ("go", "java", "cpp")

INT32 = 2**31 - 1

GO_RESERVED = {"break", "case", "chan", "const", "continue", "default", "defer", "else", "fallthrough", "for", "func",
               "go", "goto", "if", "import", "interface", "map", "package", "range", "return", "select", "struct",
               "switch", "type", "var", "int", "string", "bool", "len", "cap", "make", "new", "append", "copy",
               "max", "min", "print", "println", "error", "close", "delete", "float64", "byte", "rune"}
JAVA_CPP_RESERVED = {"abstract", "boolean", "byte", "case", "catch", "char", "class", "const", "default", "do",
                     "double", "else", "enum", "extends", "final", "float", "for", "goto", "if", "int", "long", "new",
                     "package", "private", "protected", "public", "return", "short", "static", "switch", "this",
                     "throw", "try", "void", "while", "auto", "delete", "register", "signed", "sizeof", "struct",
                     "typedef", "union", "unsigned", "volatile", "string", "vector", "map", "set", "max", "min",
                     "and", "or", "not", "xor", "operator", "template", "typename", "friend", "inline", "virtual"}

# Scalar kinds and list depths we support
SCALARS = ("int", "long", "double", "bool", "string")


# ---------------------------------------------------------------- signature inference

def _scalar_kind(v):
    if isinstance(v, bool):
        return "bool"
    if isinstance(v, int):
        return "long" if abs(v) > INT32 else "int"
    if isinstance(v, float):
        return "double"
    if isinstance(v, str):
        return "string"
    return None


def _merge(a, b):
    if a is None:
        return b
    if b is None or a == b:
        return a
    nums = {"int", "long", "double"}
    if a in nums and b in nums:
        return "double" if "double" in (a, b) else "long"
    raise ValueError("mixed types")


def _infer(values):
    """Infer (scalar, depth) for a list of sample values. Raises ValueError if unsupported."""
    scalar, depth = None, None
    for v in values:
        d, cur = 0, [v]
        # Descend through lists, collecting all elements at each level
        while cur and all(isinstance(x, list) for x in cur):
            nxt = [y for x in cur for y in x]
            d += 1
            if not nxt:
                cur = []
                break
            cur = nxt
        if cur and any(isinstance(x, list) for x in cur):
            raise ValueError("ragged nesting")
        for x in cur:
            k = _scalar_kind(x)
            if k is None:
                raise ValueError("unsupported value")
            scalar = _merge(scalar, k)
        if cur:  # only non-empty samples tell us the true depth
            if depth is not None and depth != d:
                raise ValueError("inconsistent depth")
            depth = d
    if depth is None:  # only empty lists seen
        depth = max(1, max((1 for v in values if isinstance(v, list)), default=0))
    if depth > 2:
        raise ValueError("too deep")
    return scalar or "int", depth


def _param_names(problem: dict) -> list[str]:
    m = re.search(r"def\s+\w+\s*\(([^)]*)\)", problem["starter"]["python"])
    names = [p.strip().split(":")[0].split("=")[0].strip() for p in m.group(1).split(",") if p.strip()] if m else []
    return names


def _safe(name: str, reserved: set[str]) -> str:
    return f"{name}_" if name in reserved else name


_SIG_CACHE: dict = {}


def _compute_signature(problem: dict):
    tests = problem.get("tests", [])
    if not tests:
        return None
    names = _param_names(problem)
    arity = len(tests[0]["input"])
    if len(names) != arity or any(len(t["input"]) != arity for t in tests):
        return None
    try:
        params = [_infer([t["input"][i] for t in tests]) for i in range(arity)]
        ret = _infer([t["output"] for t in tests])
    except ValueError:
        return None
    return {"names": names, "params": params, "ret": ret}


def signature(problem: dict):
    """{names, params: [(scalar, depth)], ret: (scalar, depth)} or None if the problem can't be typed."""
    tests = problem.get("tests") or [{}]
    # Cheap key (no full serialisation): edits through the admin panel change at least one of these
    key = (problem.get("slug"), problem["starter"]["python"], len(tests),
           json.dumps(tests[0], default=str), json.dumps(tests[-1], default=str))
    if key not in _SIG_CACHE:
        if len(_SIG_CACHE) > 2048:
            _SIG_CACHE.clear()
        _SIG_CACHE[key] = _compute_signature(problem)
    return _SIG_CACHE[key]


def supported_languages(problem: dict) -> list[str]:
    return list(TYPED_LANGUAGES) if signature(problem) else []


# ---------------------------------------------------------------- type rendering

GO_SCALAR = {"int": "int", "long": "int", "double": "float64", "bool": "bool", "string": "string"}
JAVA_SCALAR = {"int": "int", "long": "long", "double": "double", "bool": "boolean", "string": "String"}
CPP_SCALAR = {"int": "int", "long": "long long", "double": "double", "bool": "bool", "string": "string"}


def go_type(t):
    s, d = t
    return "[]" * d + GO_SCALAR[s]


def java_type(t):
    s, d = t
    return JAVA_SCALAR[s] + "[]" * d


def cpp_type(t):
    s, d = t
    out = CPP_SCALAR[s]
    for _ in range(d):
        out = f"vector<{out}>"
    return out


def _zero(lang, t):
    s, d = t
    if lang == "go":
        return "nil" if d else {"int": "0", "long": "0", "double": "0", "bool": "false", "string": '""'}[s]
    if lang == "java":
        if d:
            return f"new {JAVA_SCALAR[s]}[0]" + "[]" * (d - 1)
        return {"int": "0", "long": "0", "double": "0", "bool": "false", "string": '""'}[s]
    return "{}" if d or s == "string" else {"int": "0", "long": "0", "double": "0", "bool": "false"}[s]


# ---------------------------------------------------------------- starters

def starters(problem: dict) -> dict:
    sig = signature(problem)
    if not sig:
        return {}
    fn = problem["function"]["javascript"]
    go_names = [_safe(n, GO_RESERVED) for n in sig["names"]]
    jc_names = [_safe(n, JAVA_CPP_RESERVED) for n in sig["names"]]
    go_params = ", ".join(f"{n} {go_type(t)}" for n, t in zip(go_names, sig["params"]))
    java_params = ", ".join(f"{java_type(t)} {n}" for n, t in zip(jc_names, sig["params"]))
    cpp_params = ", ".join(f"{cpp_type(t)}{'&' if t[1] else ''} {n}" for n, t in zip(jc_names, sig["params"]))
    return {
        "go": (f"package main\n\n// Don't add func main: the test runner provides it.\nfunc {fn}({go_params}) "
               f"{go_type(sig['ret'])} {{\n\t// Write your solution here\n\treturn {_zero('go', sig['ret'])}\n}}\n"),
        "java": (f"import java.util.*;\n\nclass Solution {{\n    public {java_type(sig['ret'])} {fn}({java_params}) {{\n"
                 f"        // Write your solution here\n        return {_zero('java', sig['ret'])};\n    }}\n}}\n"),
        "cpp": (f"class Solution {{\npublic:\n    {cpp_type(sig['ret'])} {fn}({cpp_params}) {{\n"
                f"        // Write your solution here\n        return {_zero('cpp', sig['ret'])};\n    }}\n}};\n"),
    }


# ---------------------------------------------------------------- drivers

GO_DRIVER = r'''package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"reflect"
)

func havenNorm(rv reflect.Value) interface{} {
	if rv.Kind() == reflect.Slice {
		out := make([]interface{}, rv.Len())
		for i := 0; i < rv.Len(); i++ {
			out[i] = havenNorm(rv.Index(i))
		}
		return out
	}
	return rv.Interface()
}

func havenRun(args []json.RawMessage) (res map[string]interface{}) {
	defer func() {
		if r := recover(); r != nil {
			res = map[string]interface{}{"ok": false, "error": fmt.Sprint(r)}
		}
	}()
__DECODE__
	r := __CALL__
	return map[string]interface{}{"ok": true, "value": havenNorm(reflect.ValueOf(r))}
}

func main() {
	data, _ := io.ReadAll(os.Stdin)
	var tests [][]json.RawMessage
	if err := json.Unmarshal(data, &tests); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	out := make([]map[string]interface{}, 0, len(tests))
	for _, args := range tests {
		out = append(out, havenRun(args))
	}
	b, _ := json.Marshal(out)
	fmt.Print("\n<<<HAVEN_RESULT>>>" + string(b))
}
'''

JAVA_DRIVER = r'''import java.util.*;

public class Main {
    static String src; static int pos;

    static Object parse(String s) { src = s; pos = 0; return value(); }
    static void ws() { while (pos < src.length() && Character.isWhitespace(src.charAt(pos))) pos++; }
    static Object value() {
        ws();
        char c = src.charAt(pos);
        if (c == '[') {
            pos++; List<Object> a = new ArrayList<>(); ws();
            if (src.charAt(pos) == ']') { pos++; return a; }
            while (true) { a.add(value()); ws(); char d = src.charAt(pos++); if (d == ']') return a; }
        }
        if (c == '"') {
            pos++; StringBuilder b = new StringBuilder();
            while (true) {
                char d = src.charAt(pos++);
                if (d == '"') break;
                if (d == '\\') {
                    char e = src.charAt(pos++);
                    switch (e) {
                        case 'n': b.append('\n'); break; case 't': b.append('\t'); break;
                        case 'r': b.append('\r'); break; case 'b': b.append('\b'); break; case 'f': b.append('\f'); break;
                        case 'u': b.append((char) Integer.parseInt(src.substring(pos, pos + 4), 16)); pos += 4; break;
                        default: b.append(e);
                    }
                } else b.append(d);
            }
            return b.toString();
        }
        if (src.startsWith("true", pos)) { pos += 4; return Boolean.TRUE; }
        if (src.startsWith("false", pos)) { pos += 5; return Boolean.FALSE; }
        if (src.startsWith("null", pos)) { pos += 4; return null; }
        int start = pos;
        while (pos < src.length() && "+-0123456789.eE".indexOf(src.charAt(pos)) >= 0) pos++;
        String num = src.substring(start, pos);
        if (num.contains(".") || num.contains("e") || num.contains("E")) return Double.parseDouble(num);
        return Long.parseLong(num);
    }

    @SuppressWarnings("unchecked") static List<Object> L(Object o) { return (List<Object>) o; }
    static int I(Object o) { return ((Number) o).intValue(); }
    static long J(Object o) { return ((Number) o).longValue(); }
    static double D(Object o) { return ((Number) o).doubleValue(); }
    static boolean B(Object o) { return (Boolean) o; }
    static String S(Object o) { return (String) o; }
    static int[] I1(Object o) { List<Object> l = L(o); int[] r = new int[l.size()]; for (int i = 0; i < r.length; i++) r[i] = I(l.get(i)); return r; }
    static long[] J1(Object o) { List<Object> l = L(o); long[] r = new long[l.size()]; for (int i = 0; i < r.length; i++) r[i] = J(l.get(i)); return r; }
    static double[] D1(Object o) { List<Object> l = L(o); double[] r = new double[l.size()]; for (int i = 0; i < r.length; i++) r[i] = D(l.get(i)); return r; }
    static boolean[] B1(Object o) { List<Object> l = L(o); boolean[] r = new boolean[l.size()]; for (int i = 0; i < r.length; i++) r[i] = B(l.get(i)); return r; }
    static String[] S1(Object o) { List<Object> l = L(o); String[] r = new String[l.size()]; for (int i = 0; i < r.length; i++) r[i] = S(l.get(i)); return r; }
    static int[][] I2(Object o) { List<Object> l = L(o); int[][] r = new int[l.size()][]; for (int i = 0; i < r.length; i++) r[i] = I1(l.get(i)); return r; }
    static long[][] J2(Object o) { List<Object> l = L(o); long[][] r = new long[l.size()][]; for (int i = 0; i < r.length; i++) r[i] = J1(l.get(i)); return r; }
    static double[][] D2(Object o) { List<Object> l = L(o); double[][] r = new double[l.size()][]; for (int i = 0; i < r.length; i++) r[i] = D1(l.get(i)); return r; }
    static boolean[][] B2(Object o) { List<Object> l = L(o); boolean[][] r = new boolean[l.size()][]; for (int i = 0; i < r.length; i++) r[i] = B1(l.get(i)); return r; }
    static String[][] S2(Object o) { List<Object> l = L(o); String[][] r = new String[l.size()][]; for (int i = 0; i < r.length; i++) r[i] = S1(l.get(i)); return r; }

    static String esc(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c == '\n') b.append("\\n"); else if (c == '\t') b.append("\\t"); else if (c == '\r') b.append("\\r");
            else if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }
    static String ser(Object o) {
        if (o == null) return "null";
        if (o instanceof String) return esc((String) o);
        if (o instanceof Double || o instanceof Float) { double d = ((Number) o).doubleValue(); return Double.isFinite(d) ? Double.toString(d) : "null"; }
        if (o instanceof Number || o instanceof Boolean) return o.toString();
        if (o instanceof Character) return esc(o.toString());
        StringBuilder b = new StringBuilder("[");
        if (o instanceof Collection) { boolean f = true; for (Object x : (Collection<?>) o) { if (!f) b.append(','); b.append(ser(x)); f = false; } }
        else if (o.getClass().isArray()) {
            int n = java.lang.reflect.Array.getLength(o);
            for (int i = 0; i < n; i++) { if (i > 0) b.append(','); b.append(ser(java.lang.reflect.Array.get(o, i))); }
        } else return esc(o.toString());
        return b.append(']').toString();
    }

    static Object call(List<Object> a) {
        return new Solution().__FN__(__ARGS__);
    }

    public static void main(String[] args) throws Exception {
        List<Object> tests = L(parse(new String(System.in.readAllBytes(), "UTF-8")));
        StringBuilder out = new StringBuilder("[");
        for (int i = 0; i < tests.size(); i++) {
            if (i > 0) out.append(',');
            try {
                Object r = call(L(tests.get(i)));
                out.append("{\"ok\":true,\"value\":").append(ser(r)).append('}');
            } catch (Throwable e) {
                out.append("{\"ok\":false,\"error\":").append(esc(e.toString())).append('}');
            }
        }
        out.append(']');
        System.out.flush();
        System.out.print("\n<<<HAVEN_RESULT>>>" + out);
        System.out.flush();
    }
}
'''

CPP_PREFIX = "#include <bits/stdc++.h>\nusing namespace std;\n"

CPP_DRIVER = r'''
// ---- Programming Haven test runner ----
struct HavenJ { int t = 0; bool b = false; double d = 0; long long i = 0; bool isInt = true; string s; vector<HavenJ> a; };
struct HavenP {
    const string& src; size_t p = 0;
    explicit HavenP(const string& s) : src(s) {}
    void ws() { while (p < src.size() && isspace((unsigned char)src[p])) p++; }
    HavenJ val() {
        ws(); HavenJ v; char c = src[p];
        if (c == '[') { p++; v.t = 4; ws(); if (src[p] == ']') { p++; return v; }
            while (true) { v.a.push_back(val()); ws(); char d = src[p++]; if (d == ']') return v; } }
        if (c == '"') { p++; v.t = 3;
            while (true) { char d = src[p++]; if (d == '"') break;
                if (d == '\\') { char e = src[p++];
                    if (e == 'n') v.s += '\n'; else if (e == 't') v.s += '\t'; else if (e == 'r') v.s += '\r';
                    else if (e == 'u') { int code = stoi(src.substr(p, 4), nullptr, 16); p += 4;
                        if (code < 0x80) v.s += (char)code;
                        else if (code < 0x800) { v.s += (char)(0xC0 | (code >> 6)); v.s += (char)(0x80 | (code & 0x3F)); }
                        else { v.s += (char)(0xE0 | (code >> 12)); v.s += (char)(0x80 | ((code >> 6) & 0x3F)); v.s += (char)(0x80 | (code & 0x3F)); } }
                    else v.s += e; }
                else v.s += d; }
            return v; }
        if (src.compare(p, 4, "true") == 0) { p += 4; v.t = 1; v.b = true; return v; }
        if (src.compare(p, 5, "false") == 0) { p += 5; v.t = 1; return v; }
        if (src.compare(p, 4, "null") == 0) { p += 4; return v; }
        size_t st = p; while (p < src.size() && string("+-0123456789.eE").find(src[p]) != string::npos) p++;
        string num = src.substr(st, p - st); v.t = 2;
        if (num.find_first_of(".eE") != string::npos) { v.isInt = false; v.d = stod(num); } else { v.i = stoll(num); v.d = (double)v.i; }
        return v; }
};
template <typename T> struct HavenAs;
template <> struct HavenAs<int> { static int get(const HavenJ& v) { return (int)v.i; } };
template <> struct HavenAs<long long> { static long long get(const HavenJ& v) { return v.i; } };
template <> struct HavenAs<double> { static double get(const HavenJ& v) { return v.isInt ? (double)v.i : v.d; } };
template <> struct HavenAs<bool> { static bool get(const HavenJ& v) { return v.b; } };
template <> struct HavenAs<string> { static string get(const HavenJ& v) { return v.s; } };
template <typename T> struct HavenAs<vector<T>> { static vector<T> get(const HavenJ& v) {
    vector<T> r; r.reserve(v.a.size()); for (auto& x : v.a) r.push_back(HavenAs<T>::get(x)); return r; } };

string havenSer(int v) { return to_string(v); }
string havenSer(long long v) { return to_string(v); }
string havenSer(long v) { return to_string(v); }
string havenSer(unsigned v) { return to_string(v); }
string havenSer(size_t v) { return to_string(v); }
string havenSer(bool v) { return v ? "true" : "false"; }
string havenSer(double v) { if (!isfinite(v)) return "null"; ostringstream o; o << setprecision(17) << v; return o.str(); }
string havenSer(const string& s) {
    string r = "\"";
    for (unsigned char c : s) {
        if (c == '"' || c == '\\') { r += '\\'; r += (char)c; }
        else if (c == '\n') r += "\\n"; else if (c == '\t') r += "\\t"; else if (c == '\r') r += "\\r";
        else if (c < 0x20) { char buf[8]; snprintf(buf, sizeof buf, "\\u%04x", c); r += buf; }
        else r += (char)c;
    }
    return r + "\"";
}
string havenSer(char c) { return havenSer(string(1, c)); }
template <typename T> string havenSer(const vector<T>& v) {
    string r = "["; bool first = true;
    for (const auto& x : v) { if (!first) r += ","; r += havenSer((T)x); first = false; }
    return r + "]";
}

int main() {
    ios::sync_with_stdio(true);
    string input((istreambuf_iterator<char>(cin)), istreambuf_iterator<char>());
    HavenP parser(input);
    HavenJ tests = parser.val();
    string out = "[";
    for (size_t ti = 0; ti < tests.a.size(); ti++) {
        if (ti) out += ",";
        const HavenJ& a = tests.a[ti];
        try {
__DECODE__
            Solution sol;
            auto r = sol.__FN__(__ARGS__);
            out += "{\"ok\":true,\"value\":" + havenSer(r) + "}";
        } catch (const exception& e) {
            out += "{\"ok\":false,\"error\":" + havenSer(string(e.what())) + "}";
        } catch (...) {
            out += "{\"ok\":false,\"error\":\"unknown exception\"}";
        }
    }
    out += "]";
    cout << flush << "\n<<<HAVEN_RESULT>>>" << out << flush;
    return 0;
}
'''

JAVA_CONV = {("int", 0): "I", ("long", 0): "J", ("double", 0): "D", ("bool", 0): "B", ("string", 0): "S"}


def _java_conv(t):
    s, d = t
    return JAVA_CONV[(s, 0)] + (str(d) if d else "")


def build(language: str, problem: dict, code: str):
    """Return (main_source, extra_files) for the runner, or None if the problem can't be typed."""
    sig = signature(problem)
    if not sig:
        return None
    fn = problem["function"]["javascript"]
    n = len(sig["params"])
    if language == "go":
        decode = "\n".join(f"\tvar a{i} {go_type(t)}\n\tif err := json.Unmarshal(args[{i}], &a{i}); err != nil {{ panic(err) }}"
                           for i, t in enumerate(sig["params"]))
        call = f"{fn}({', '.join(f'a{i}' for i in range(n))})"
        return code, {"driver.go": GO_DRIVER.replace("__DECODE__", decode).replace("__CALL__", call)}
    if language == "java":
        args = ", ".join(f"{_java_conv(t)}(a.get({i}))" for i, t in enumerate(sig["params"]))
        return JAVA_DRIVER.replace("__FN__", fn).replace("__ARGS__", args), {"Solution.java": code}
    if language == "cpp":
        decode = "\n".join(f"            {cpp_type(t)} a{i} = HavenAs<{cpp_type(t)}>::get(a.a[{i}]);"
                           for i, t in enumerate(sig["params"]))
        driver = CPP_DRIVER.replace("__DECODE__", decode).replace("__FN__", fn).replace(
            "__ARGS__", ", ".join(f"a{i}" for i in range(n)))
        return CPP_PREFIX + code + "\n" + driver, {}
    return None
