import { useRef, useState } from "react";
import { Link } from "react-router";
import SplashScreen from "../components/SplashScreen";

import img1 from "../assets/img/slide1.JPG";
import img2 from "../assets/img/slide2.JPG";
import img3 from "../assets/img/slide3.JPG";
import img4 from "../assets/img/slide4.png";
import arrowIcon from "../assets/img/arrow.svg";

const SLIDES = [
  { img: img1, title: "Organize your collections in minutes" },
  { img: img2, title: "Add your physical items digitally" },
  { img: img3, title: "Sort your collections by categories" },
  { img: img4, title: "Ready? Let’s get Collectify-ing!" },
];

export default function LandingPage() {
  const [idx, setIdx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const deltaXRef = useRef(0);

  const go = (i) => setIdx((i + SLIDES.length) % SLIDES.length);
  const next = () => go(idx + 1);
  const prev = () => go(idx - 1);
  const isLast = idx === SLIDES.length - 1;

  const onTouchStart = (e) => {
    if (!e.touches?.length) return;
    setDragging(true);
    startXRef.current = e.touches[0].clientX;
    deltaXRef.current = 0;
  };

  const onTouchMove = (e) => {
    if (!dragging || !e.touches?.length) return;
    const x = e.touches[0].clientX;
    deltaXRef.current = x - startXRef.current;
    setIdx((i) => i);
  };

  const onTouchEnd = () => {
    if (!dragging) return;
    setDragging(false);

    const THRESHOLD = 60;
    const dx = deltaXRef.current;

    if (Math.abs(dx) > THRESHOLD) {
      dx < 0 ? next() : prev();
    }

    deltaXRef.current = 0;
  };

  const transformFor = (i) =>
    `translateX(calc(${(i - idx) * 100}% + ${
      dragging ? deltaXRef.current : 0
    }px))`;

  return (
    <>
      <SplashScreen />

      <main>
        <h1 className="landing-page-title">{SLIDES[idx].title}</h1>

        <div
          className={`landing-page-slider ${dragging ? "dragging" : ""}`}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          aria-roledescription="carousel"
          aria-label="Collectify intro"
        >
          <div className="slider-frame">
            {SLIDES.map((s, i) => (
              <div
                key={i}
                className={`slide ${i === idx ? "active" : ""}`}
                style={{ transform: transformFor(i) }}
                aria-hidden={i !== idx}
              >
                <img
                  className="slide-image"
                  src={s.img}
                  alt=""
                  loading={i === idx ? "eager" : "lazy"}
                />
              </div>
            ))}
          </div>

          <div
            className="slider-dots"
            role="tablist"
            aria-label="Slide selector"
          >
            {SLIDES.map((_, i) => (
              <button
                key={i}
                className={`dot ${i === idx ? "active" : ""}`}
                onClick={() => go(i)}
                role="tab"
                aria-selected={i === idx}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </div>

        {/* CTA-knapper vises kun på sidste slide */}
        <div className={`landing-page-btns-slider ${isLast ? "show" : ""}`}>
          <Link to="/login" className="login-btn" aria-label="Login">
            Login
          </Link>
          <Link
            to="/signup"
            className="get-started-btn"
            aria-label="Get Started"
          >
            Get Started
            <img
              src={arrowIcon}
              alt="white arrow icon"
              className="arrow-icon"
              aria-hidden="true"
            />
          </Link>
        </div>
      </main>
    </>
  );
}
