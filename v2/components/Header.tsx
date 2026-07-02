export default function Header() {
  return (
    <header className="border-b-4 border-black bg-[#fff6e4] py-6">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-8">
        <h1 className="text-4xl font-black tracking-tight">
          <span>GORILLA</span>
          <span className="text-[#b7352d]">ORDER</span>
        </h1>

        <div className="rounded-full border border-[#dfd0b8] bg-[#fffdf7] px-5 py-2 font-bold text-[#6f695e]">
          v2 Build Mode
        </div>
      </div>
    </header>
  );
}