import { useRef } from "react";
import { Input } from "antd";
import { Highlight, type PrismTheme } from "prism-react-renderer";

const theme: PrismTheme = {
  plain: { color: "#172137", backgroundColor: "transparent" },
  styles: [
    { types: ["keyword", "builtin", "boolean"], style: { color: "#0000ff" } },
    { types: ["string", "char"], style: { color: "#d00000" } },
    { types: ["number"], style: { color: "#008000" } },
    { types: ["comment"], style: { color: "#607660" } },
    { types: ["property"], style: { color: "#a31515" } },
  ],
};

function languageFor(file: string) {
  if (/\.py$/i.test(file)) return "python";
  if (/\.[cm]?js$/i.test(file)) return "javascript";
  if (/\.json$/i.test(file)) return "json";
  return "plain";
}

export function SourceCodeEditor({
  file,
  value,
  onChange,
}: {
  file: string;
  value: string;
  onChange(value: string): void;
}) {
  const lineNumbers = useRef<HTMLDivElement>(null);
  const highlight = useRef<HTMLPreElement>(null);
  return (
    <div className="code-editor">
      <div className="line-numbers" ref={lineNumbers} aria-hidden="true">
        {value.split("\n").map((_, index) => (
          <div key={index}>{index + 1}</div>
        ))}
      </div>
      <div className="code-input-surface">
        <Highlight code={value} language={languageFor(file)} theme={theme}>
          {({ tokens, getLineProps, getTokenProps }) => (
            <pre className="code-highlight" ref={highlight} aria-hidden="true">
              <code>
                {tokens.map((line, index) => (
                  <div key={index} {...getLineProps({ line })}>
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token })} />
                    ))}
                  </div>
                ))}
              </code>
            </pre>
          )}
        </Highlight>
        <Input.TextArea
          aria-label="脚本代码"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onScroll={(event) => {
            const input = event.currentTarget;
            if (lineNumbers.current)
              lineNumbers.current.scrollTop = input.scrollTop;
            if (highlight.current) {
              highlight.current.scrollTop = input.scrollTop;
              highlight.current.scrollLeft = input.scrollLeft;
            }
          }}
          wrap="off"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </div>
    </div>
  );
}
