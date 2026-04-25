import React, { useState } from 'react';

interface TutorialScreenProps {
  onClose: () => void;
}

const tutorialSteps = [
  { title: "Движение", text: "Используйте [WASD] для перемещения по бункеру. Подойдите к терминалу." },
  { title: "Фонарь", text: "Нажмите [ЛКМ] или [F], чтобы включить фонарь. Свет отпугивает тени." },
  { title: "Перегрузка", text: "Нажмите [ПКМ], чтобы активировать перегрузку фонаря. Это мощный импульс света." },
  { title: "Флаеры", text: "Нажмите [G], чтобы бросить флаер и создать зону безопасности." },
  { title: "Бой", text: "Убейте появившуюся тень, используя свет фонаря." },
  { title: "Завершение", text: "Обучение пройдено. Вы готовы к смене." }
];

const TutorialScreen = ({ onClose }: TutorialScreenProps) => {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center pointer-events-auto p-8">
      <div className="max-w-3xl w-full border border-green-900/50 bg-black/90 p-8 text-center relative">
        <h2 className="text-4xl font-bold text-white tracking-[0.2em] mb-8 uppercase">
          {tutorialSteps[currentStep].title}
        </h2>
        <div className="text-gray-300 font-mono text-xl mb-12 text-center">
          <p>{tutorialSteps[currentStep].text}</p>
        </div>
        <button 
          onClick={handleNext}
          className="px-8 py-3 bg-green-600 text-black font-bold uppercase tracking-widest hover:bg-green-500 transition-all duration-300"
        >
          {currentStep < tutorialSteps.length - 1 ? 'Далее' : 'Завершить'}
        </button>
      </div>
    </div>
  );
};

export default TutorialScreen;
