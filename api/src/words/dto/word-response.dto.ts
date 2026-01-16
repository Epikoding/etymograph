import { ApiProperty } from '@nestjs/swagger';

export class EtymologyComponent {
  @ApiProperty()
  part: string;

  @ApiProperty()
  meaning: string;
}

export class EtymologyOrigin {
  @ApiProperty()
  language: string;

  @ApiProperty()
  root: string;

  @ApiProperty({ type: [EtymologyComponent] })
  components: EtymologyComponent[];
}

export class EtymologyData {
  @ApiProperty()
  word: string;

  @ApiProperty({ type: EtymologyOrigin })
  origin: EtymologyOrigin;

  @ApiProperty()
  evolution: string;

  @ApiProperty()
  originalMeaning: string;

  @ApiProperty()
  modernMeaning: string;
}

export class DerivativeItem {
  @ApiProperty()
  word: string;

  @ApiProperty()
  meaning: string;

  @ApiProperty()
  relationship: string;
}

export class DerivativesData {
  @ApiProperty()
  word: string;

  @ApiProperty()
  root: string;

  @ApiProperty()
  rootMeaning: string;

  @ApiProperty({ type: [DerivativeItem] })
  derivatives: DerivativeItem[];
}

export class SynonymItem {
  @ApiProperty()
  word: string;

  @ApiProperty()
  definition: string;

  @ApiProperty()
  nuance: string;

  @ApiProperty()
  usage: string;

  @ApiProperty()
  example: string;
}

export class SynonymsData {
  @ApiProperty()
  word: string;

  @ApiProperty()
  definition: string;

  @ApiProperty({ type: [SynonymItem] })
  synonyms: SynonymItem[];
}

export class WordResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  word: string;

  @ApiProperty({ type: EtymologyData, nullable: true })
  etymology: EtymologyData | null;

  @ApiProperty({ type: [String] })
  derivatives: string[];

  @ApiProperty({ type: SynonymsData, nullable: true })
  synonyms: SynonymsData | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
