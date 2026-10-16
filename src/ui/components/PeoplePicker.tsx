import { UserPlus } from "lucide-react";
import { useState } from "react";
import { friendsOf, isValidEmail } from "../../domain/people";
import type { ID } from "../../domain/types";
import * as A from "../../store/actions";
import { useData, useRun } from "../context";
import { Avatar } from "./basics";

/** Campo para escolher um amigo pelo nome/e-mail ou cadastrar alguém novo na hora. */
export function PeoplePicker({ exclude, onPick, placeholder }: { exclude: ID[]; onPick: (id: ID) => void; placeholder?: string }) {
  const { ds } = useData();
  const runAction = useRun();
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
  const [focus, setFocus] = useState(false);
  const q = text.trim().toLowerCase();
  const list = friendsOf(ds).filter(
    (p) => !exclude.includes(p.id) && (!q || p.name.toLowerCase().includes(q) || p.email?.includes(q)),
  );
  const exact = list.some((p) => p.name.toLowerCase() === q || p.email === q);

  const create = () => {
    const typedEmail = isValidEmail(text) ? text.trim() : email.trim();
    const name = isValidEmail(text) ? text.split("@")[0] : text.trim();
    const id = runAction(A.addPerson, { name, email: typedEmail || undefined });
    if (id) {
      onPick(id);
      setText("");
      setEmail("");
    }
  };

  return (
    <div className="people-picker">
      <div className="picker-row">
        <input
          value={text}
          placeholder={placeholder || "Nome ou e-mail"}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q) {
              e.preventDefault();
              if (list.length) {
                onPick(list[0].id);
                setText("");
              } else create();
            }
          }}
          aria-label="Adicionar pessoa"
        />
        {q && !exact && !isValidEmail(text) && (
          <input
            value={email}
            placeholder="E-mail (opcional)"
            type="email"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                create();
              }
            }}
            aria-label="E-mail da nova pessoa"
          />
        )}
        {q && !exact && (
          <button type="button" className="btn btn-mint btn-sm" onClick={create}>
            Adicionar
          </button>
        )}
      </div>
      {focus && (list.length > 0 || (q && !exact)) && (
        <div className="suggestions">
          {list.slice(0, 8).map((p) => (
            <button
              type="button"
              key={p.id}
              className="suggestion"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(p.id);
                setText("");
              }}
            >
              <Avatar person={p} size={24} /> {p.name}
              {p.email && <span className="muted"> · {p.email}</span>}
            </button>
          ))}
          {q && !exact && (
            <button type="button" className="suggestion add" onMouseDown={(e) => e.preventDefault()} onClick={create}>
              <UserPlus size={16} /> Adicionar “{text.trim()}” como novo amigo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
